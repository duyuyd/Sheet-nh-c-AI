# Góc Hợp Âm · Android & iOS 1.3.0

**Tác giả dự án & người lập trình: NPT Duy.**

Tra bài hát, đọc hợp âm, đổi tông, lưu ngoại tuyến và tập cùng YouTube.

- [Website](https://gochopam.pages.dev/)
- [Tải APK Android miễn phí](https://gochopam.pages.dev/ung-dung/)
- [Bản phát hành](https://github.com/duyuyd/goc-hop-am/releases)
- [Trạng thái biên dịch thực tế](https://github.com/duyuyd/goc-hop-am/actions)

## Bản 1.3.0

- Đọc phụ đề JSON3, XML, SRT, VTT và LRC; sửa nhận dữ liệu YouTube và báo rõ trường hợp bị chặn / rỗng / không có phụ đề. Phụ đề chèn vào hình không phải tệp mốc lời. Có chọn tệp, chỉnh lệch mốc và đánh dấu câu; không dùng micro để đoán lời video.
- Kéo chỉnh khung YouTube 200–420 px để chừa chỗ đọc lời. Khung video vẫn hiển thị khi nghe.
- 144 hợp âm có tiếng mẫu, gam trưởng và vòng hòa âm; piano chạm để chơi và sáng theo nốt khi phát sheet.
- Soạn sheet một bè nhịp 4/4, in / lưu PDF, sao lưu JSON và chỉnh từng nốt. Nhận sheet nháp từ tệp hát/đàn một bè: dưới 3 MB, tối đa 60 giây / 128 nốt mỗi lần. Xử lý trên máy, cần nghe lại và chỉnh, không nhận chính xác bản phối nhiều nhạc cụ.
- Nhật ký luyện tập trên máy; liên kết mở MuseScore, IMSLP và Musopen để tìm sheet. Chưa nhập toàn bộ thư viện bên ngoài.
- Website có thể thêm ra màn hình chính. Bài đã lưu và công cụ luyện nhạc mở ngoại tuyến sau lần tải đầu; YouTube và tra cứu trực tuyến cần mạng.

Phần thu âm, quay màn hình và camera của 1.2.1 được giữ nguyên. Bản ghi không tự tải lên website hoặc GitHub. Theo lời chỉ hoạt động tự động khi nhận được phụ đề công khai khớp với bài; có phụ đề hiển thị trong YouTube không bảo đảm máy chủ nhận được dữ liệu.

© 2026 NPT Duy. Xem [Thông tin tác giả](COPYRIGHT.md). Chữ “chưa ký” của IPA/AAB là trạng thái gói cài đặt.

## Android

Android 8 trở lên. APK phát hành trực tiếp dùng gói `vn.gochopam.app.preview`; cùng khóa ký các bản 1.0/1.1, versionCode 5 để cập nhật giữ bài đã lưu. Khóa ký không nằm trong kho này. Đây là bản thử nghiệm, chưa phát hành trên CH Play.

```sh
node mobile/scripts/prepare-web.mjs
node --test tests/mobile.test.mjs
gradle -p mobile/android :app:bundleRelease
```

Dùng JDK 17, Gradle 8.13, Android SDK 36. AAB production `vn.gochopam.app` chưa ký bằng upload key. Script SDK độc lập trong `mobile/scripts/build-android.py` cũng có thể build khi cung cấp SDK, ECJ, bundletool và khóa thử nghiệm riêng; không tạo đè khóa đang dùng để cập nhật app.

## iOS

Mở `mobile/ios/GocHopAm.xcodeproj` bằng Xcode. Target iOS 16 trở lên. Không cần CocoaPods. GitHub Actions biên dịch bản Simulator và bản thiết bị chưa ký; kết quả thực tế xem tại Actions.

```sh
node mobile/scripts/prepare-web.mjs
xcodebuild -project mobile/ios/GocHopAm.xcodeproj -scheme GocHopAm \
  -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath mobile/build/ios-simulator CODE_SIGNING_ALLOWED=NO build
```

**IPA chưa ký không cài trực tiếp lên iPhone và chưa phải bản App Store.** Để cài/phân phối, chủ sở hữu cần chọn Apple Team/chứng chỉ/provisioning của mình trong Xcode. Tệp Simulator chỉ dành cho Xcode Simulator. Không đưa chứng chỉ, mật khẩu hoặc khóa ký vào kho công khai.

## Phạm vi mã nguồn

Kho công khai gồm giao diện ứng dụng và vỏ native Android/iOS. Kết nối API đọc kho bài công khai tại website. Không chứa backend riêng, tài khoản, cơ sở dữ liệu, tài liệu PDF, bản ghi của người dùng hoặc bí mật vận hành. Lời/hợp âm và video lấy từ kho kết nối khi dùng app; kho mã này không đóng gói các nội dung đó.

Không có số liệu cài đặt/người dùng giả. Phiên bản, checksum APK và dung lượng thật được công bố tại [`android-release.json`](https://gochopam.pages.dev/downloads/android-release.json); kết quả build và commit xem trong Actions.
