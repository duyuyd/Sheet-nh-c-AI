package vn.gochopam.app;

import android.content.Context;
import android.graphics.SurfaceTexture;
import android.hardware.camera2.*;
import android.media.MediaRecorder;
import android.os.*;
import android.util.Size;
import android.view.*;
import android.widget.FrameLayout;
import java.io.File;
import java.util.*;
import org.json.JSONObject;

/** Front camera recording in the foreground activity, without WebView capture. */
final class CameraRecorder {
  private final MainActivity activity;
  private final java.util.function.Consumer<JSONObject> events;
  private HandlerThread thread;
  private Handler handler;
  private TextureView preview;
  private CameraDevice camera;
  private CameraCaptureSession session;
  private MediaRecorder recorder;
  private Surface previewSurface;
  private File part,target;
  private volatile boolean busy,recording;
  private boolean finishing;
  CameraRecorder(MainActivity activity,java.util.function.Consumer<JSONObject> events){this.activity=activity;this.events=events;}
  boolean busy(){return busy;}
  void start(){
    if(busy)return;busy=true;finishing=false;
    thread=new HandlerThread("GocCamera");thread.start();handler=new Handler(thread.getLooper());
    preview=new TextureView(activity);preview.setOpaque(false);
    FrameLayout.LayoutParams params=new FrameLayout.LayoutParams(dp(108),dp(144),Gravity.END|Gravity.BOTTOM);params.setMargins(dp(12),dp(12),dp(14),dp(82));
    activity.addContentView(preview,params);
    preview.setSurfaceTextureListener(new TextureView.SurfaceTextureListener(){
      public void onSurfaceTextureAvailable(SurfaceTexture texture,int width,int height){handler.post(()->open(texture));}
      public void onSurfaceTextureSizeChanged(SurfaceTexture texture,int width,int height){}
      public boolean onSurfaceTextureDestroyed(SurfaceTexture texture){stop();return true;}
      public void onSurfaceTextureUpdated(SurfaceTexture texture){}
    });
    if(preview.isAvailable())handler.post(()->open(preview.getSurfaceTexture()));
  }
  private int dp(int value){return Math.round(value*activity.getResources().getDisplayMetrics().density);}
  private void emit(String state,String error){try{JSONObject value=new JSONObject().put("state",state);if(error!=null)value.put("error",error);activity.runOnUiThread(()->events.accept(value));}catch(Exception ignored){}}
  @SuppressWarnings("MissingPermission") private void open(SurfaceTexture texture){
    if(finishing||texture==null)return;
    try{
      CameraManager manager=(CameraManager)activity.getSystemService(Context.CAMERA_SERVICE);String selected=null;CameraCharacteristics characteristics=null;
      for(String id:manager.getCameraIdList()){CameraCharacteristics c=manager.getCameraCharacteristics(id);Integer facing=c.get(CameraCharacteristics.LENS_FACING);if(facing!=null&&facing==CameraCharacteristics.LENS_FACING_FRONT){selected=id;characteristics=c;break;}}
      if(selected==null)throw new Exception("Thiết bị không có camera trước.");
      Size[] sizes=characteristics.get(CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP).getOutputSizes(MediaRecorder.class);
      Size size=Arrays.stream(sizes).filter(s->s.getWidth()<=1280&&s.getHeight()<=1280).max(Comparator.comparingLong(s->(long)s.getWidth()*s.getHeight())).orElse(sizes[0]);
      target=new File(StudioService.directory(activity),"GocHopAm-"+System.currentTimeMillis()+"-"+UUID.randomUUID().toString().substring(0,8)+".mp4");part=new File(target.getPath()+".part");
      recorder=new MediaRecorder();recorder.setAudioSource(MediaRecorder.AudioSource.MIC);recorder.setVideoSource(MediaRecorder.VideoSource.SURFACE);recorder.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4);
      recorder.setAudioEncoder(MediaRecorder.AudioEncoder.AAC);recorder.setAudioSamplingRate(44100);recorder.setAudioEncodingBitRate(128000);recorder.setVideoEncoder(MediaRecorder.VideoEncoder.H264);recorder.setVideoSize(size.getWidth(),size.getHeight());recorder.setVideoFrameRate(30);recorder.setVideoEncodingBitRate(2500000);recorder.setOutputFile(part.getAbsolutePath());
      Integer sensor=characteristics.get(CameraCharacteristics.SENSOR_ORIENTATION);int rotation=activity.getWindowManager().getDefaultDisplay().getRotation()*90;recorder.setOrientationHint(((sensor==null?270:sensor)+rotation)%360);
      recorder.setMaxDuration(1800000);recorder.setMaxFileSize(300000000);recorder.setOnInfoListener((r,what,extra)->{if(what==MediaRecorder.MEDIA_RECORDER_INFO_MAX_DURATION_REACHED||what==MediaRecorder.MEDIA_RECORDER_INFO_MAX_FILESIZE_REACHED)stop();});recorder.setOnErrorListener((r,what,extra)->fail("Camera đã ngừng ghi. Hãy thử lại."));recorder.prepare();
      texture.setDefaultBufferSize(size.getWidth(),size.getHeight());previewSurface=new Surface(texture);
      manager.openCamera(selected,new CameraDevice.StateCallback(){
        public void onOpened(CameraDevice device){if(finishing){device.close();return;}camera=device;configure();}
        public void onDisconnected(CameraDevice device){device.close();fail("Camera bị ngắt kết nối.");}
        public void onError(CameraDevice device,int error){device.close();fail("Camera đang bận hoặc chưa được cho phép.");}
      },handler);
    }catch(Exception e){fail(e.getMessage()==null?"Chưa mở được camera trước.":e.getMessage());}
  }
  private void configure(){try{
    Surface recordingSurface=recorder.getSurface();camera.createCaptureSession(Arrays.asList(previewSurface,recordingSurface),new CameraCaptureSession.StateCallback(){
      public void onConfigured(CameraCaptureSession value){if(finishing){value.close();return;}session=value;try{CaptureRequest.Builder request=camera.createCaptureRequest(CameraDevice.TEMPLATE_RECORD);request.addTarget(previewSurface);request.addTarget(recordingSurface);session.setRepeatingRequest(request.build(),null,handler);recorder.start();recording=true;emit("recording",null);}catch(Exception e){fail("Chưa bắt đầu được camera. Hãy đóng ứng dụng khác đang dùng camera.");}}
      public void onConfigureFailed(CameraCaptureSession value){value.close();fail("Camera chưa hỗ trợ cấu hình ghi này.");}
    },handler);
  }catch(Exception e){fail("Chưa cấu hình được camera trước.");}}
  void stop(){Handler h=handler;if(h!=null)h.post(()->finish(null));}
  private void fail(String message){Handler h=handler;if(h!=null&&Looper.myLooper()!=h.getLooper())h.post(()->finish(message));else finish(message);}
  private void finish(String error){if(finishing||!busy)return;finishing=true;boolean saved=false;
    try{if(session!=null){session.stopRepeating();session.abortCaptures();}}catch(Exception ignored){}
    try{if(recording&&recorder!=null){recorder.stop();saved=part!=null&&part.length()>0&&part.renameTo(target);}}catch(Exception ignored){}
    recording=false;if(session!=null){session.close();session=null;}if(camera!=null){camera.close();camera=null;}if(recorder!=null){recorder.release();recorder=null;}if(previewSurface!=null){previewSurface.release();previewSurface=null;}
    if(!saved&&part!=null)part.delete();activity.runOnUiThread(()->{if(preview!=null&&preview.getParent() instanceof android.view.ViewGroup)((android.view.ViewGroup)preview.getParent()).removeView(preview);preview=null;});
    busy=false;emit(saved?"stopped":"error",saved?null:error!=null?error:"Bản ghi quá ngắn. Hãy ghi vài giây rồi dừng.");if(thread!=null)thread.quitSafely();handler=null;thread=null;
  }
}
