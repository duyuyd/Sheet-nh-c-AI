# Góc Hợp Âm — Android & iOS 1.2

Ứng dụng đi cùng website hiện có, dùng các GET công khai từ `https://gochopam.pages.dev`. Không tạo lại hoặc di chuyển D1/R2, tài khoản, mật khẩu, cửa hàng hay lịch của website.

## Những gì đã triển khai

- Giao diện đóng gói bên trong app, chạy được khi không có mạng; không nhúng toàn bộ website.
- Tra cứu bài, ca sĩ, nhạc sĩ, 13 thể loại, mới cập nhật và phân trang.
- Mở lời/hợp âm, đổi tông kể cả hợp âm đảo, A−/A+, tự cuộn có chọn tốc độ.
- Lưu/xóa tối đa 100 bài và 2 MB trên thiết bị; nội dung được mở từ bản lưu trước khi gọi mạng.
- Máy đếm nhịp 40–240 BPM, 2/3/4/6 phách và chạm đặt nhịp. Android phát bằng ToneGenerator; iOS phát âm click được tạo tại chỗ bằng AVAudioPlayer, không dùng micro.
- Chia sẻ tên bài qua bảng chia sẻ hệ thống; giữ màn hình sáng khi đọc/tập và dừng nhịp khi rời app.
- Bản 1.2 có YouTube trong WebView riêng không có cầu nối dữ liệu của app: chọn bản thu, dán link, đóng hoặc mở YouTube ngoài. Video cần mạng; thư viện ngoại tuyến chỉ giữ lời/hợp âm và ID video.
- Bản 1.2 không có đăng nhập, quản trị hoặc cửa hàng/thanh toán PDF. Các chức năng đó trên website không thay đổi. Không đặt biểu mẫu Google trong WebView.

## Android

Android 8.0 trở lên (minSdk 26), target/compile SDK 36. Không chứa thư viện native `.so`. Tên gói dự kiến phát hành: `vn.gochopam.app`; cần kiểm tra trong tài khoản cửa hàng trước khi giữ cố định.

Mở thư mục `mobile/android` trong Android Studio, Gradle 8.13, AGP 8.13.2, JDK 17; dùng Build → Generate Signed App Bundle để ký bằng upload key của chủ tài khoản. Gradle assets trỏ tới `public/mobile`. Có thể chạy `gradle :app:assembleDebug :app:bundleRelease` nếu Gradle đã cài. Không đưa keystore, mật khẩu hoặc khóa API vào Git/chat.

Ngoài Gradle, `scripts/build-android.py` dùng trực tiếp SDK chính thức, Eclipse ECJ 3.40.0 và Google bundletool 1.28.3. Cần các đường dẫn cục bộ:

```sh
python3 mobile/scripts/build-android.py \
  --android-jar /path/to/android-36/android.jar \
  --build-tools /path/to/build-tools/36.0.0 \
  --ecj /path/to/ecj-3.40.0.jar \
  --bundletool /path/to/bundletool-all-1.28.3.jar \
  --debug-keystore /private/local/android-debug.keystore
```

Kết quả:

- `mobile/build/Goc_Hop_Am_Android_Cai_Thu.apk`: cài thử trực tiếp, gói `vn.gochopam.app.preview`, ký bằng khóa Android debug. Không tải bản này lên Play production.
- `mobile/build/Goc_Hop_Am_Play_Chua_Ky.aab`: gói production, đã kiểm tra cấu trúc bundle, chưa ký bằng upload key của chủ sở hữu. Không tuyên bố đã được CH Play chấp nhận.

Các bản build hiện được biên dịch và kiểm tra chữ ký/cấu trúc; chưa chạy trên Android vật lý hoặc emulator. Bản cài thử có dữ liệu riêng, không tự chuyển thư viện sang bản production.

## iPhone / iPad

Mở `mobile/ios/GocHopAm.xcodeproj` trên macOS có Xcode 26 hoặc bản mới hơn đáp ứng yêu cầu App Store tại lúc gửi. Không có CocoaPods hoặc gói bên thứ ba. Chọn Team của chủ sở hữu và xác nhận Bundle ID. Target iOS 16 trở lên, có iPhone/iPad. Resources tham chiếu trực tiếp `public/mobile`, cần giữ cấu trúc thư mục trong gói nguồn.

```sh
node mobile/scripts/prepare-web.mjs
xcodebuild -project mobile/ios/GocHopAm.xcodeproj -scheme GocHopAm \
  -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath mobile/build/ios-simulator CODE_SIGNING_ALLOWED=NO build
```

Sau khi kiểm thử Simulator và iPhone: Product → Archive → Distribute App → App Store Connect → TestFlight. Chọn chứng chỉ/provisioning trong Xcode bằng tài khoản của chủ app, không chép khóa riêng vào repo. GitHub Actions đã biên dịch thành công Simulator và IPA thiết bị chưa ký (run41837377478). Không có Apple Team/chứng chỉ/provisioning cho bản phân phối, chưa có IPA đã ký, TestFlight hoặc App Store. Tải tệp thực tại https://github.com/duyuyd/goc-hop-am/releases/tag/v1.2.0.

## Kiểm tra chung

```sh
node mobile/scripts/prepare-web.mjs
node --test tests/mobile.test.mjs
node --check public/mobile/bundle.js
```

Tác giả dự án & người lập trình trong Giới thiệu: Nguyễn Phan Thế Duy.

Xem UI tại `/mobile/index.html` trên website. Bản web dùng GET cùng origin và localStorage; bản cài dùng cầu nối native với kho dữ liệu riêng. Thử trên thiết bị thật: tìm/mở bài, lưu rồi tắt mạng để mở lại, chuyển tông và font, tự cuộn, chia sẻ, nhịp/âm lượng, thoát app và xoay màn hình. Bài chưa lưu và tìm kiếm vẫn cần mạng/máy chủ hoạt động; app không xóa hạn ngạch máy chủ.

## Trạng thái phát hành

Trang tải APK trực tiếp miễn phí: `https://gochopam.pages.dev/ung-dung/`. Script `mobile/scripts/publish-android-preview.py` chép đúng APK đã build và checksum ra tài nguyên công khai. Không chép khóa ký vào public hoặc repo. Cùng package `.preview` và khóa debug của 1.0, versionCode tăng lên 3 để cài đè giữ dữ liệu.

Chưa đăng ứng dụng nào lên cửa hàng. Play Console và App Store Connect chưa có phiên đăng nhập được cấp cho công việc này. Phần cần chủ sở hữu cung cấp qua đăng nhập an toàn: tài khoản nhà phát triển, tên pháp nhân/người phát hành, email hỗ trợ được phép công khai, thông tin khai báo cửa hàng và khóa ký do chủ sở hữu kiểm soát. Xem `store/SUBMISSION.md`. Không dùng email cá nhân trong ảnh chụp làm email công khai khi chưa được chủ sở hữu chọn.


## Cập nhật 1.2

Giao diện đọc lời gọn hơn, nhận mốc video thật qua YouTube API, nhập LRC hoặc đánh dấu câu; nhận giọng trên máy là thử nghiệm khi thiết bị hỗ trợ. Thêm Phòng thu cho micro, camera trước, màn hình và micro; tệp thực lưu riêng trên máy, xuất/chia sẻ theo thao tác. Kho công khai: https://github.com/duyuyd/goc-hop-am. GitHub Actions đã biên dịch iOS Simulator; xem kết quả mới nhất trên Actions. Chưa có IPA đã ký hoặc bản cửa hàng.

## Bản sửa 1.2.1

Sửa thứ tự setMaxDuration/setMaxFileSize trước prepare của MediaRecorder. Camera trước dùng Camera2 trong activity, có hình xem trước; quay màn hình và micro dùng foreground service. Giao diện web chỉ bật kiểu ghi mà trình duyệt có hỗ trợ, bản ghi lưu trong IndexedDB. Theo lời tự lấy phụ đề công khai và đồng hồ của video YouTube; không nghe micro người hát. Nếu video không cung cấp phụ đề khớp, dùng LRC hoặc đánh dấu mốc. Bản APK mới tăng versionCode lên 4 và giữ khóa thử nghiệm cũ để cài đè.
