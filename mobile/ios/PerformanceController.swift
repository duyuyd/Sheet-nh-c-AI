import UIKit
import AVFoundation
import ReplayKit
import Speech

final class PerformanceController: NSObject, AVCaptureFileOutputRecordingDelegate {
    weak var owner: MusicViewController?
    private(set) var permissionPending = false
    private var audio: AVAudioRecorder?
    private var capture: AVCaptureSession?
    private var movie: AVCaptureMovieFileOutput?
    private var preview: UIView?
    private var mode: String?
    private var output: URL?
    private var pendingStart: String?
    private var pendingStop: String?
    private var speechEngine: AVAudioEngine?
    private var speechTask: SFSpeechRecognitionTask?
    private var speechRequest: SFSpeechAudioBufferRecognitionRequest?
    init(owner: MusicViewController) { self.owner = owner }
    private func answer(_ id: String, _ ok: Bool, _ value: Any) { owner?.reply(id, ok, value) }
    private func event(_ value: [String: Any]) { owner?.emit("GocRecordingEvent", value) }
    private func folder() throws -> URL {
        let root = try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true).appendingPathComponent("Performances", isDirectory: true)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        var excluded = root; var values = URLResourceValues(); values.isExcludedFromBackup = true; try excluded.setResourceValues(values)
        return root
    }
    private func newFile(_ ext: String) throws -> URL { try folder().appendingPathComponent("GocHopAm-\(Int(Date().timeIntervalSince1970 * 1000))-\(UUID().uuidString.prefix(8)).\(ext)") }
    private func validFile(_ name: String) throws -> URL {
        guard name.range(of: "^GocHopAm-[A-Za-z0-9.-]+\\.(mp4|m4a|webm)$", options: .regularExpression) != nil else { throw URLError(.badURL) }
        let file = try folder().appendingPathComponent(name)
        guard FileManager.default.fileExists(atPath: file.path) else { throw URLError(.fileDoesNotExist) }
        return file
    }
    func handle(id: String, action: String, args: [String: Any]) -> Bool {
        switch action {
        case "recordStart": start(id: id, mode: args["mode"] as? String ?? "audio")
        case "recordStop": stop(id: id)
        case "recordings":
            do { let files = try FileManager.default.contentsOfDirectory(at: folder(), includingPropertiesForKeys: [.fileSizeKey]); let items: [[String: Any]] = files.sorted { $0.lastPathComponent > $1.lastPathComponent }.filter { $0 != output }.prefix(100).compactMap { file in guard ["m4a", "mp4", "webm"].contains(file.pathExtension), let size = try? file.resourceValues(forKeys: [.fileSizeKey]).fileSize, size > 0 else { return nil }; return ["name": file.lastPathComponent, "bytes": size] }; answer(id, true, ["items": items]) } catch { answer(id, false, "Chưa đọc được bản ghi trên máy.") }
        case "recordSave", "recordShare":
            do { let file = try validFile(args["name"] as? String ?? ""); guard let owner = owner else { return true }; if action == "recordSave" { owner.present(UIDocumentPickerViewController(forExporting: [file], asCopy: true), animated: true) } else { let share = UIActivityViewController(activityItems: [file], applicationActivities: nil); share.popoverPresentationController?.sourceView = owner.view; share.popoverPresentationController?.sourceRect = CGRect(x: owner.view.bounds.midX, y: owner.view.bounds.midY, width: 1, height: 1); owner.present(share, animated: true) }; answer(id, true, true) } catch { answer(id, false, "Không mở được tệp bản ghi.") }
        case "speechStart": startSpeech(id: id)
        case "speechStop": stopSpeech(); answer(id, true, true)
        case "settingsLoad": do { let file = try folder().appendingPathComponent("follow-v2.json"); let value = (try? String(contentsOf: file, encoding: .utf8)) ?? "{}"; answer(id, true, value) } catch { answer(id, true, "{}") }
        case "settingsSave": do { guard let value = args["value"] as? String, value.utf8.count < 250000, let data = value.data(using: .utf8), (try JSONSerialization.jsonObject(with: data)) is [String: Any] else { throw URLError(.dataLengthExceedsMaximum) }; try data.write(to: folder().appendingPathComponent("follow-v2.json"), options: .atomic); answer(id, true, true) } catch { answer(id, false, "Chưa lưu được mốc lời.") }
        default: return false
        }
        return true
    }
    private func start(id: String, mode: String) {
        guard self.mode == nil, !permissionPending else { answer(id, false, "Đã có bản ghi đang chạy."); return }
        guard ["audio", "screen", "screen-camera", "camera"].contains(mode) else { answer(id, false, "Kiểu ghi không hợp lệ."); return }
        stopSpeech(); permissionPending = true; pendingStart = id
        let group = DispatchGroup(); var granted = true
        let mediaTypes: [AVMediaType] = mode.contains("camera") ? [.audio, .video] : [.audio]
        for type in mediaTypes { group.enter(); AVCaptureDevice.requestAccess(for: type) { ok in if !ok { granted = false }; group.leave() } }
        group.notify(queue: .main) { [weak self] in guard let self = self else { return }; guard granted else { self.failed("Chưa cho phép camera hoặc micro."); return }; self.begin(mode: mode) }
    }
    private func begin(mode: String) {
        do {
            try AVAudioSession.sharedInstance().setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker, .mixWithOthers]); try AVAudioSession.sharedInstance().setActive(true)
            let file = try newFile(mode == "audio" ? "m4a" : "mp4"); output = file; self.mode = mode
            if mode == "audio" { audio = try AVAudioRecorder(url: file, settings: [AVFormatIDKey: kAudioFormatMPEG4AAC, AVSampleRateKey: 44100, AVNumberOfChannelsKey: 1, AVEncoderBitRateKey: 128000]); guard audio?.record() == true else { throw URLError(.cannotCreateFile) }; began() }
            else if mode == "camera" { try beginCamera(file: file) }
            else { let screen = RPScreenRecorder.shared(); guard screen.isAvailable else { throw URLError(.unsupportedURL) }; screen.isMicrophoneEnabled = true; screen.isCameraEnabled = mode == "screen-camera"; screen.cameraPosition = .front; screen.startRecording { [weak self] error in DispatchQueue.main.async { guard let self = self else { return }; if error != nil { self.failed("Thiết bị chưa bắt đầu được quay màn hình.") } else { if let camera = screen.cameraPreviewView { self.attach(camera) }; self.began() } } } }
        } catch { failed("Chưa bắt đầu được bản ghi trên thiết bị.") }
    }
    private func began() { permissionPending = false; if let id = pendingStart { answer(id, true, true) }; pendingStart = nil; event(["state": "recording"]) }
    private func attach(_ view: UIView) { guard let host = owner?.recordingPreviewHost else { return }; view.frame = CGRect(x: max(0, host.bounds.width - 104), y: max(100, host.bounds.height - 180), width: 90, height: 120); view.layer.cornerRadius = 12; view.clipsToBounds = true; host.addSubview(view); preview = view }
    private func beginCamera(file: URL) throws {
        guard let camera = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .front), let mic = AVCaptureDevice.default(for: .audio) else { throw URLError(.resourceUnavailable) }
        let session = AVCaptureSession(); session.beginConfiguration(); session.sessionPreset = .hd1280x720
        let video = try AVCaptureDeviceInput(device: camera), sound = try AVCaptureDeviceInput(device: mic); guard session.canAddInput(video), session.canAddInput(sound) else { throw URLError(.resourceUnavailable) }; session.addInput(video); session.addInput(sound)
        let movie = AVCaptureMovieFileOutput(); guard session.canAddOutput(movie) else { throw URLError(.resourceUnavailable) }; session.addOutput(movie); movie.maxRecordedFileSize = 300000000; session.commitConfiguration(); self.movie = movie; capture = session
        let view = UIView(); let layer = AVCaptureVideoPreviewLayer(session: session); layer.videoGravity = .resizeAspectFill; layer.frame = CGRect(x: 0, y: 0, width: 90, height: 120); view.layer.addSublayer(layer); attach(view)
        DispatchQueue.global(qos: .userInitiated).async { session.startRunning(); movie.startRecording(to: file, recordingDelegate: self) }
    }
    func fileOutput(_ output: AVCaptureFileOutput, didStartRecordingTo fileURL: URL, from connections: [AVCaptureConnection]) { DispatchQueue.main.async { self.began() } }
    func fileOutput(_ output: AVCaptureFileOutput, didFinishRecordingTo fileURL: URL, from connections: [AVCaptureConnection], error: Error?) { DispatchQueue.main.async { if let error = error as NSError?, (error.userInfo[AVErrorRecordingSuccessfullyFinishedKey] as? Bool) != true { self.failed("Chưa hoàn tất tệp camera.") } else { self.completed() } } }
    private func stop(id: String) {
        guard let mode = mode else { answer(id, true, true); return }; pendingStop = id
        if mode == "audio" { audio?.stop(); completed() }
        else if mode == "camera" { movie?.stopRecording() }
        else if let file = output { RPScreenRecorder.shared().stopRecording(withOutput: file) { [weak self] error in DispatchQueue.main.async { if error != nil { self?.failed("Chưa lưu được tệp quay màn hình.") } else { self?.completed() } } } }
    }
    private func completed() { let size = output.flatMap { try? $0.resourceValues(forKeys: [.fileSizeKey]) }?.fileSize ?? 0; if size <= 0 { failed("Bản ghi chưa có dữ liệu."); return }; if let id = pendingStop { answer(id, true, true) }; pendingStop = nil; cleanup(); event(["state": "stopped"]) }
    private func failed(_ message: String) { if let file = output { try? FileManager.default.removeItem(at: file) }; if let id = pendingStart { answer(id, false, message) }; if let id = pendingStop { answer(id, false, message) }; pendingStart = nil; pendingStop = nil; cleanup(); event(["state": "error", "error": message]) }
    private func cleanup() { permissionPending = false; audio = nil; capture?.stopRunning(); capture = nil; movie = nil; preview?.removeFromSuperview(); preview = nil; mode = nil; output = nil }
    func stopSpeech() { speechTask?.cancel(); speechTask = nil; speechRequest?.endAudio(); speechRequest = nil; if let engine = speechEngine { engine.stop(); engine.inputNode.removeTap(onBus: 0) }; speechEngine = nil }
    private func startSpeech(id: String) {
        guard mode == nil else { answer(id, false, "Micro đang dành cho bản ghi; hãy theo mốc thời gian."); return }
        guard let recognizer = SFSpeechRecognizer(locale: Locale(identifier: "vi-VN")), recognizer.supportsOnDeviceRecognition else { answer(id, false, "Thiết bị chưa có nhận giọng tiếng Việt trên máy. Dùng LRC hoặc đánh dấu câu."); return }
        permissionPending = true
        SFSpeechRecognizer.requestAuthorization { [weak self] auth in AVCaptureDevice.requestAccess(for: .audio) { ok in DispatchQueue.main.async { guard let self = self else { return }; self.permissionPending = false; guard auth == .authorized && ok else { self.answer(id, false, "Chưa cho phép nhận giọng và micro."); return }; self.runSpeech(id: id, recognizer: recognizer) } } }
    }
    private func runSpeech(id: String, recognizer: SFSpeechRecognizer) {
        do { stopSpeech(); try AVAudioSession.sharedInstance().setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker, .mixWithOthers]); try AVAudioSession.sharedInstance().setActive(true); let engine = AVAudioEngine(); let input = engine.inputNode; let format = input.outputFormat(forBus: 0); guard format.sampleRate > 0 && format.channelCount > 0 else { throw URLError(.resourceUnavailable) }; let request = SFSpeechAudioBufferRecognitionRequest(); request.requiresOnDeviceRecognition = true; request.shouldReportPartialResults = true; input.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, _ in request.append(buffer) }; speechEngine = engine; speechRequest = request; engine.prepare(); try engine.start(); speechTask = recognizer.recognitionTask(with: request) { [weak self] result, error in DispatchQueue.main.async { guard let self = self else { return }; if let result = result { self.owner?.emit("GocSpeechEvent", ["text": result.bestTranscription.formattedString]) }; if error != nil || result?.isFinal == true { self.stopSpeech(); self.owner?.emit("GocSpeechEvent", ["error": "Lượt nhận giọng đã kết thúc. Chọn lại để tiếp tục, hoặc dùng mốc thời gian."]) } } }; answer(id, true, true) } catch { stopSpeech(); answer(id, false, "Chưa mở được nhận giọng trên thiết bị.") }
    }
}
