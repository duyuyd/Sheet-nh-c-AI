import UIKit
import WebKit
import AVFoundation
import SafariServices

private final class NoRedirects: NSObject, URLSessionTaskDelegate {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) { completionHandler(nil) }
}

private final class PlayerNavigation: NSObject, WKNavigationDelegate {
    let appHost: String
    init(appHost: String) { self.appHost = appHost }
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url else { decisionHandler(.cancel); return }
        if action.targetFrame?.isMainFrame == false { decisionHandler(url.scheme == "https" || url.scheme == "about" ? .allow : .cancel); return }
        let allowed = url.scheme == "about" || (url.scheme == "https" && (url.host == appHost || (["www.youtube.com", "www.youtube-nocookie.com"].contains(url.host ?? "") && url.path.hasPrefix("/embed/"))))
        decisionHandler(allowed ? .allow : .cancel)
    }
}

private final class PlayerMetrics: NSObject, WKScriptMessageHandler {
    weak var owner: MusicViewController?
    let host: String
    init(owner: MusicViewController, host: String) { self.owner = owner; self.host = host }
    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.frameInfo.isMainFrame, message.frameInfo.securityOrigin.host == host, let value = message.body as? [String: Any], let time = value["time"] as? Double, time.isFinite, time >= 0, time < 86400 else { return }
        owner?.emit("GocVideoTick", value)
    }
}
private final class BundledUI: NSObject, WKURLSchemeHandler {
    private let names: Set<String> = ["index.html", "bundle.js", "app.css", "icon.svg"]
    func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        guard let url = urlSchemeTask.request.url, url.host == "bundle" else { urlSchemeTask.didFailWithError(URLError(.badURL)); return }
        let name = url.path == "/" ? "index.html" : String(url.path.dropFirst())
        guard names.contains(name), let location = Bundle.main.url(forResource: name, withExtension: nil), let data = try? Data(contentsOf: location) else { urlSchemeTask.didFailWithError(URLError(.fileDoesNotExist)); return }
        let mime = name.hasSuffix(".js") ? "application/javascript" : name.hasSuffix(".css") ? "text/css" : name.hasSuffix(".svg") ? "image/svg+xml" : "text/html"
        urlSchemeTask.didReceive(URLResponse(url: url, mimeType: mime, expectedContentLength: data.count, textEncodingName: "utf-8"))
        urlSchemeTask.didReceive(data)
        urlSchemeTask.didFinish()
    }
    func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {}
}

final class MusicViewController: UIViewController, WKScriptMessageHandler, WKNavigationDelegate, UIDocumentPickerDelegate {
    private var web: WKWebView!
    private var documentRequest: String?
    private var printingSheet = false
    private var videoExtent: CGFloat = 200
    private var readingAudio = false
    private lazy var performance = PerformanceController(owner: self)
    var recordingPreviewHost: UIView { web }
    private let layoutStack = UIStackView()
    private var videoPanel: UIStackView?
    private var videoWeb: WKWebView?
    private var playerNavigation: PlayerNavigation?
    private var playerMetrics: PlayerMetrics?
    private var videoSize: NSLayoutConstraint?
    private var timer: DispatchSourceTimer?
    private var players: [AVAudioPlayer] = []
    private var beat = 0
    private let apiOrigin = "https://goc-hop-am.onwardcrust.chatgpt.site"
    private let redirectGuard = NoRedirects()
    private lazy var session: URLSession = {
        let config = URLSessionConfiguration.ephemeral
        config.httpCookieStorage = nil
        config.httpShouldSetCookies = false
        config.timeoutIntervalForRequest = 20
        config.timeoutIntervalForResource = 23
        return URLSession(configuration: config, delegate: redirectGuard, delegateQueue: nil)
    }()
    override var preferredStatusBarStyle: UIStatusBarStyle { .lightContent }
    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 0.13, green: 0.10, blue: 0.18, alpha: 1)
        let config = WKWebViewConfiguration()
        config.setURLSchemeHandler(BundledUI(), forURLScheme: "gocapp")
        config.userContentController.add(self, name: "goc")
        config.preferences.javaScriptCanOpenWindowsAutomatically = false
        web = WKWebView(frame: .zero, configuration: config)
        web.navigationDelegate = self
        web.isOpaque = false
        web.backgroundColor = view.backgroundColor
        web.scrollView.backgroundColor = view.backgroundColor
        web.scrollView.contentInsetAdjustmentBehavior = .never
        web.translatesAutoresizingMaskIntoConstraints = false
        layoutStack.axis = .vertical
        layoutStack.translatesAutoresizingMaskIntoConstraints = false
        layoutStack.addArrangedSubview(web)
        view.addSubview(layoutStack)
        NSLayoutConstraint.activate([layoutStack.leadingAnchor.constraint(equalTo: view.leadingAnchor), layoutStack.trailingAnchor.constraint(equalTo: view.trailingAnchor), layoutStack.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor), layoutStack.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor)])
        web.load(URLRequest(url: URL(string: "gocapp://bundle/index.html")!))
        NotificationCenter.default.addObserver(self, selector: #selector(pause), name: UIApplication.willResignActiveNotification, object: nil)
    }
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        decisionHandler(navigationAction.request.url?.scheme == "gocapp" && navigationAction.request.url?.host == "bundle" ? .allow : .cancel)
    }
    func reply(_ id: String, _ ok: Bool, _ value: Any) {
        guard let encoded = try? JSONSerialization.data(withJSONObject: [id, ok, value]), let json = String(data: encoded, encoding: .utf8) else { return }
        DispatchQueue.main.async { [weak self] in self?.web.evaluateJavaScript("window.GocNativeReply && window.GocNativeReply(...\(json))", completionHandler: nil) }
    }
    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        guard let panel = videoPanel else { return }
        let horizontal = view.bounds.width > view.bounds.height
        if (layoutStack.axis == .horizontal) != horizontal || videoSize == nil {
            videoSize?.isActive = false
            layoutStack.axis = horizontal ? .horizontal : .vertical
            videoSize = horizontal ? panel.widthAnchor.constraint(equalTo: layoutStack.widthAnchor, multiplier: min(0.65, max(0.25, videoExtent / max(1, view.bounds.width)))) : panel.heightAnchor.constraint(equalToConstant: videoExtent)
            videoSize?.isActive = true
        }
    }
    private func closeVideo(notify: Bool) {
        videoWeb?.stopLoading()
        videoWeb?.loadHTMLString("", baseURL: nil)
        videoSize?.isActive = false; videoSize = nil
        videoWeb?.removeFromSuperview(); videoWeb = nil
        if let panel = videoPanel { layoutStack.removeArrangedSubview(panel); panel.removeFromSuperview() }
        videoPanel = nil; playerNavigation = nil; layoutStack.axis = .vertical
        if notify { web.evaluateJavaScript("window.GocVideoClosed && window.GocVideoClosed()", completionHandler: nil) }
    }
    @objc private func closeVideoFromButton() { closeVideo(notify: true) }
    private func showVideo(id: String) throws {
        guard id.range(of: "^[A-Za-z0-9_-]{11}$", options: .regularExpression) != nil else { throw URLError(.badURL) }
        closeVideo(notify: false); stopMetro()
        let appHost = (Bundle.main.bundleIdentifier ?? "vn.gochopam.app").lowercased()
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .nonPersistent()
        let metrics = PlayerMetrics(owner: self, host: appHost); playerMetrics = metrics
        config.userContentController.add(metrics, name: "videoMetrics")
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = .all
        // No application message handler is registered on this separate player.
        let player = WKWebView(frame: .zero, configuration: config)
        let navigation = PlayerNavigation(appHost: appHost)
        playerNavigation = navigation; player.navigationDelegate = navigation
        player.scrollView.isScrollEnabled = false
        let panel = UIStackView(); panel.axis = .vertical; panel.backgroundColor = .black
        let bar = UIStackView(); bar.axis = .horizontal; bar.alignment = .center; bar.isLayoutMarginsRelativeArrangement = true; bar.layoutMargins = UIEdgeInsets(top: 0, left: 10, bottom: 0, right: 10)
        let label = UILabel(); label.text = "YouTube · Góc Hợp Âm"; label.font = .systemFont(ofSize: 12); label.textColor = UIColor(red: 0.9, green: 0.74, blue: 0.47, alpha: 1)
        let close = UIButton(type: .system); close.setTitle("Đóng video", for: .normal); close.addTarget(self, action: #selector(closeVideoFromButton), for: .touchUpInside)
        bar.addArrangedSubview(label); bar.addArrangedSubview(close); bar.heightAnchor.constraint(equalToConstant: 44).isActive = true
        panel.addArrangedSubview(player)
        videoPanel = panel; videoWeb = player; layoutStack.insertArrangedSubview(panel, at: 0)
        view.setNeedsLayout(); view.layoutIfNeeded()
        let origin = "https://" + appHost
        var embed = URLComponents(string: "https://www.youtube-nocookie.com/embed/" + id)!
        embed.queryItems = [URLQueryItem(name: "playsinline", value: "1"), URLQueryItem(name: "controls", value: "1"), URLQueryItem(name: "rel", value: "0"), URLQueryItem(name: "autoplay", value: "0"), URLQueryItem(name: "fs", value: "0"), URLQueryItem(name: "origin", value: origin)]
        guard let templateURL = Bundle.main.url(forResource: "player.html", withExtension: nil), let scriptURL = Bundle.main.url(forResource: "player.js", withExtension: nil) else { throw URLError(.fileDoesNotExist) }
        let configData = try JSONSerialization.data(withJSONObject: ["id": id, "origin": origin])
        let json = String(data: configData, encoding: .utf8)!
        let html = try String(contentsOf: templateURL, encoding: .utf8).replacingOccurrences(of: "<script id=\"goc-player-config\" type=\"application/json\">{}</script>", with: "<script id=\"goc-player-config\" type=\"application/json\">\(json)</script>").replacingOccurrences(of: "<script src=\"player.js?v=121\"></script>", with: "<script>\(try String(contentsOf: scriptURL, encoding: .utf8))</script>")
        player.loadHTMLString(html, baseURL: URL(string: origin + "/"))
    }
    func emit(_ hook: String, _ value: [String: Any]) { guard let data = try? JSONSerialization.data(withJSONObject: value), let json = String(data: data, encoding: .utf8) else { return }; web.evaluateJavaScript("window.\(hook) && window.\(hook)(\(json))", completionHandler: nil) }
    private func libraryURL() throws -> URL {
        let directory = try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true).appendingPathComponent("GocHopAm", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        var excluded = directory
        var values = URLResourceValues(); values.isExcludedFromBackup = true
        try excluded.setResourceValues(values)
        return directory.appendingPathComponent("offline-v1.json")
    }
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.frameInfo.isMainFrame, message.frameInfo.request.url?.scheme == "gocapp", message.frameInfo.request.url?.host == "bundle", let body = message.body as? [String: Any], let id = body["id"] as? String, id.range(of: "^[0-9]{1,12}$", options: .regularExpression) != nil, let action = body["action"] as? String else { return }
        let args = body["args"] as? [String: Any] ?? [:]
        if performance.handle(id: id, action: action, args: args) { return }
        do {
            switch action {
            case "videoLayout":
                videoExtent = CGFloat(max(200, min(420, args["size"] as? Int ?? 200)))
                videoSize?.isActive = false; videoSize = nil; view.setNeedsLayout(); view.layoutIfNeeded()
            case "sheetSource":
                let sources = ["musescore": "https://musescore.com/sheetmusic", "imslp": "https://imslp.org/", "musopen": "https://musopen.org/sheetmusic/"]
                guard let source = args["source"] as? String, let target = sources[source], let url = URL(string: target) else { reply(id, false, "Nguồn không hợp lệ."); return }
                UIApplication.shared.open(url)
            case "readAudio":
                guard documentRequest == nil else { reply(id, false, "Đang chọn một tệp khác."); return }
                documentRequest = id; readingAudio = true
                let audioPicker = UIDocumentPickerViewController(documentTypes: ["public.audio"], in: .import)
                audioPicker.delegate = self; audioPicker.allowsMultipleSelection = false
                present(audioPicker, animated: true); return
            case "readText":
                guard documentRequest == nil else { reply(id, false, "Đang chọn một tệp khác."); return }
                documentRequest = id; readingAudio = false
                let picker = UIDocumentPickerViewController(documentTypes: ["public.text", "public.json", "public.data"], in: .import)
                picker.delegate = self; picker.allowsMultipleSelection = false
                present(picker, animated: true); return
            case "saveText":
                guard let text = args["text"] as? String, let bytes = text.data(using: .utf8), bytes.count <= 250_000 else { reply(id, false, "Tệp quá lớn."); return }
                let fileName = (args["name"] as? String) == "Goc_Hop_Am_Sheet.musicxml" ? "Goc_Hop_Am_Sheet.musicxml" : "Goc_Hop_Am_Sheet.json"
                let file = FileManager.default.temporaryDirectory.appendingPathComponent(fileName)
                try bytes.write(to: file, options: .atomic)
                let export = UIActivityViewController(activityItems: [file], applicationActivities: nil)
                export.popoverPresentationController?.sourceView = web
                export.popoverPresentationController?.sourceRect = CGRect(x: web.bounds.midX, y: 20, width: 1, height: 1)
                present(export, animated: true)
            case "printSheet":
                guard let html = args["html"] as? String, html.utf8.count <= 500_000 else { reply(id, false, "Bản in quá lớn."); return }
                let printController = UIPrintInteractionController.shared
                let info = UIPrintInfo(dictionary: nil); info.outputType = .general; info.jobName = "Góc Hợp Âm - Sheet"
                printController.printInfo = info
                printController.printFormatter = UIMarkupTextPrintFormatter(markupText: html)
                printingSheet = true
                printController.present(animated: true) { [weak self] _, _, _ in self?.printingSheet = false }
            case "video":
                guard let videoID = args["id"] as? String else { reply(id, false, "Video không hợp lệ."); return }
                try showVideo(id: videoID)
            case "videoClose": closeVideo(notify: false)
            case "videoExternal":
                guard let videoID = args["id"] as? String, videoID.range(of: "^[A-Za-z0-9_-]{11}$", options: .regularExpression) != nil else { reply(id, false, "Video không hợp lệ."); return }
                closeVideo(notify: true)
                UIApplication.shared.open(URL(string: "https://www.youtube.com/watch?v=" + videoID)!)
            case "siteOpen":
                var components = URLComponents(string: apiOrigin + "/")!
                components.queryItems = [URLQueryItem(name: "q", value: String((args["q"] as? String ?? "").prefix(120)))]
                guard let url = components.url else { reply(id, false, "Liên kết Sites không hợp lệ."); return }
                let safari = SFSafariViewController(url: url)
                present(safari, animated: true)
            case "api":
                guard let path = args["path"] as? String, path.count < 2000, path.range(of: "^/api/(catalog|reader|video-captions)\\?[^\\r\\n#]*$", options: .regularExpression) != nil, let url = URL(string: apiOrigin + path) else { reply(id, false, "Yêu cầu không hợp lệ."); return }
                var request = URLRequest(url: url); request.setValue("application/json", forHTTPHeaderField: "Accept"); request.setValue("GocHopAmIOS/1.2", forHTTPHeaderField: "User-Agent")
                session.dataTask(with: request) { [weak self] data, response, error in
                    guard let self = self else { return }
                    guard error == nil, let response = response as? HTTPURLResponse, response.statusCode == 200, response.mimeType?.contains("json") == true, let data = data, data.count <= 2_000_000, let json = try? JSONSerialization.jsonObject(with: data), json is [String: Any] else { self.reply(id, false, "Chưa tải được bài. Hãy kiểm tra mạng rồi thử lại."); return }
                    self.reply(id, true, json)
                }.resume()
                return
            case "load":
                let file = try libraryURL()
                let data = FileManager.default.fileExists(atPath: file.path) ? try Data(contentsOf: file) : Data("{}".utf8)
                guard data.count <= 2_000_000 else { reply(id, false, "Thư viện ngoại tuyến quá lớn."); return }
                reply(id, true, String(data: data, encoding: .utf8) ?? "{}"); return
            case "save":
                guard let value = args["value"] as? String, let data = value.data(using: .utf8), data.count <= 2_000_000, let json = try JSONSerialization.jsonObject(with: data) as? [String: Any], json.count <= 100 else { reply(id, false, "Thư viện ngoại tuyến đã đầy."); return }
                try data.write(to: libraryURL(), options: .atomic)
            case "awake": UIApplication.shared.isIdleTimerDisabled = args["enabled"] as? Bool ?? false
            case "metronome":
                stopMetro()
                if args["running"] as? Bool == true {
                    let bpm = max(40, min(240, args["bpm"] as? Int ?? 80))
                    let count = args["beats"] as? Int ?? 4
                    try startMetro(bpm: bpm, beats: [2, 3, 4, 6].contains(count) ? count : 4)
                }
            case "share":
                guard let text = args["text"] as? String, text.count <= 800 else { reply(id, false, "Nội dung quá dài."); return }
                let sharedURL = (args["url"] as? String).flatMap { URL(string: $0) }
                let items: [Any] = sharedURL?.scheme == "https" && sharedURL?.host == "goc-hop-am.onwardcrust.chatgpt.site" ? [text, sharedURL!] : [text]
                let share = UIActivityViewController(activityItems: items, applicationActivities: nil)
                share.popoverPresentationController?.sourceView = web
                share.popoverPresentationController?.sourceRect = CGRect(x: web.bounds.midX, y: 20, width: 1, height: 1)
                present(share, animated: true)
            case "github": UIApplication.shared.open(URL(string: "https://github.com/duyuyd/goc-hop-am")!)
            case "help": UIApplication.shared.open(URL(string: apiOrigin + "/huong-dan")!)
            default: reply(id, false, "Thao tác chưa được hỗ trợ."); return
            }
            reply(id, true, true)
        } catch { reply(id, false, "Chưa thực hiện được thao tác trên thiết bị.") }
    }
    func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
        if let id = documentRequest { reply(id, true, "") }; documentRequest = nil; readingAudio = false
    }
    func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        guard let id = documentRequest else { return }; documentRequest = nil
        let audio = readingAudio; readingAudio = false
        guard let url = urls.first else { reply(id, true, ""); return }
        let access = url.startAccessingSecurityScopedResource(); defer { if access { url.stopAccessingSecurityScopedResource() } }
        do {
            let limit = audio ? 3_000_000 : 250_000
            let size = try url.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? (limit + 1)
            guard size <= limit else { reply(id, false, "Chọn tệp văn bản dưới 250 KB."); return }
            let bytes = try Data(contentsOf: url)
            if audio { guard bytes.count <= limit else { reply(id, false, "Tệp âm thanh quá lớn."); return }; reply(id, true, ["base64": bytes.base64EncodedString()]); return }
            guard bytes.count <= 250_000, let text = String(data: bytes, encoding: .utf8) else { reply(id, false, "Tệp cần dùng mã UTF-8."); return }
            reply(id, true, text)
        } catch { reply(id, false, "Chưa đọc được tệp đã chọn.") }
    }
    private func clickSound(frequency: Double) -> Data {
        let rate: UInt32 = 22050, samples = 1212
        var pcm = Data()
        for i in 0..<samples {
            let envelope = pow(1 - Double(i) / Double(samples), 3)
            var sample = Int16(sin(2 * .pi * frequency * Double(i) / Double(rate)) * 15000 * envelope).littleEndian
            withUnsafeBytes(of: &sample) { pcm.append(contentsOf: $0) }
        }
        var wav = Data("RIFF".utf8)
        func append32(_ n: UInt32) { var n = n.littleEndian; withUnsafeBytes(of: &n) { wav.append(contentsOf: $0) } }
        func append16(_ n: UInt16) { var n = n.littleEndian; withUnsafeBytes(of: &n) { wav.append(contentsOf: $0) } }
        append32(UInt32(pcm.count + 36)); wav.append(Data("WAVEfmt ".utf8)); append32(16); append16(1); append16(1); append32(rate); append32(rate * 2); append16(2); append16(16); wav.append(Data("data".utf8)); append32(UInt32(pcm.count)); wav.append(pcm)
        return wav
    }
    private func startMetro(bpm: Int, beats: Int) throws {
        try AVAudioSession.sharedInstance().setCategory(.playback, mode: .default, options: .mixWithOthers)
        try AVAudioSession.sharedInstance().setActive(true)
        if players.isEmpty { players = try [1100.0, 740.0].map { try AVAudioPlayer(data: clickSound(frequency: $0)) }; players.forEach { $0.prepareToPlay() } }
        beat = 0
        let timer = DispatchSource.makeTimerSource(queue: .main)
        timer.schedule(deadline: .now(), repeating: .microseconds(60_000_000 / bpm), leeway: .milliseconds(1))
        timer.setEventHandler { [weak self] in
            guard let self = self else { return }
            let player = self.players[self.beat == 0 ? 0 : 1]
            player.currentTime = 0; player.play()
            self.web.evaluateJavaScript("window.GocNativeBeat && window.GocNativeBeat(\(self.beat))", completionHandler: nil)
            self.beat = (self.beat + 1) % beats
        }
        self.timer = timer; timer.resume()
    }
    private func stopMetro() { timer?.cancel(); timer = nil; players.forEach { $0.stop() } }
    @objc private func pause() {
        if performance.permissionPending || documentRequest != nil || printingSheet { return }
        performance.stopSpeech(); closeVideo(notify: true); stopMetro(); UIApplication.shared.isIdleTimerDisabled = false
        web.evaluateJavaScript("window.dispatchEvent(new Event('nativePause'))", completionHandler: nil)
    }
    deinit { NotificationCenter.default.removeObserver(self); timer?.cancel(); session.invalidateAndCancel() }
}
