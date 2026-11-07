package vn.gochopam.app;

import android.app.*;
import android.content.*;
import android.content.pm.ServiceInfo;
import android.hardware.display.*;
import android.media.MediaRecorder;
import android.media.projection.*;
import android.os.*;
import android.util.DisplayMetrics;
import java.io.File;
import java.util.UUID;
import org.json.JSONObject;

/** User-started recording only, with an ongoing system notification and stop action. */
public final class StudioService extends Service {
  static volatile boolean active;
  static volatile String activeName;
  private MediaRecorder recorder;
  private MediaProjection projection;
  private VirtualDisplay display;
  private File output,finalOutput;
  private boolean stopping;
  private final Handler handler=new Handler(Looper.getMainLooper());
  public static File directory(Context c){File d=new File(c.getFilesDir(),"performances");d.mkdirs();return d;}
  static void event(String state,String error){try{JSONObject value=new JSONObject().put("state",state);if(error!=null)value.put("error",error);StudioController.notifyEvent(value);}catch(Exception ignored){}}
  @Override public IBinder onBind(Intent intent){return null;}
  @Override public int onStartCommand(Intent intent,int flags,int startId){
    if(intent==null){stopSelf();return START_NOT_STICKY;}
    if("STOP".equals(intent.getAction())){finish();return START_NOT_STICKY;}
    if(active){event("error","Đã có một bản ghi đang chạy.");return START_NOT_STICKY;}
    boolean screen=intent.getBooleanExtra("screen",false);
    try{
      NotificationManager manager=(NotificationManager)getSystemService(NOTIFICATION_SERVICE);
      manager.createNotificationChannel(new NotificationChannel("performance","Bản ghi Góc Hợp Âm",NotificationManager.IMPORTANCE_LOW));
      PendingIntent stop=PendingIntent.getService(this,10,new Intent(this,StudioService.class).setAction("STOP"),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
      PendingIntent open=PendingIntent.getActivity(this,11,new Intent(this,MainActivity.class),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
      Notification notice=new Notification.Builder(this,"performance").setSmallIcon(android.R.drawable.ic_btn_speak_now).setContentTitle("Góc Hợp Âm đang ghi").setContentText(screen?"Màn hình và micro · Bấm Dừng để lưu":"Thu âm micro · Bấm Dừng để lưu").setContentIntent(open).setOngoing(true).addAction(new Notification.Action.Builder(null,"Dừng và lưu",stop).build()).build();
      int types=Build.VERSION.SDK_INT>=30?ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE:0;if(screen&&Build.VERSION.SDK_INT>=29)types|=ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION;
      if(Build.VERSION.SDK_INT>=29)startForeground(61,notice,types);else startForeground(61,notice);
      finalOutput=new File(directory(this),"GocHopAm-"+System.currentTimeMillis()+"-"+UUID.randomUUID().toString().substring(0,8)+(screen?".mp4":".m4a"));output=new File(finalOutput.getPath()+".part");activeName=output.getName();
      if(directory(this).getUsableSpace()<20000000)throw new Exception("Thiết bị không còn đủ dung lượng ghi.");
      recorder=new MediaRecorder();recorder.setAudioSource(MediaRecorder.AudioSource.MIC);if(screen)recorder.setVideoSource(MediaRecorder.VideoSource.SURFACE);
      recorder.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4);recorder.setAudioEncoder(MediaRecorder.AudioEncoder.AAC);recorder.setAudioSamplingRate(44100);recorder.setAudioEncodingBitRate(128000);recorder.setOutputFile(output.getAbsolutePath());
      recorder.setMaxDuration(1800000);recorder.setMaxFileSize(300000000);recorder.setOnInfoListener((r,what,extra)->{if(what==MediaRecorder.MEDIA_RECORDER_INFO_MAX_DURATION_REACHED||what==MediaRecorder.MEDIA_RECORDER_INFO_MAX_FILESIZE_REACHED)finish();});
      if(screen){DisplayMetrics m=getResources().getDisplayMetrics();float scale=Math.min(1f,1920f/Math.max(m.widthPixels,m.heightPixels));int width=Math.max(2,((int)(m.widthPixels*scale)/2)*2),height=Math.max(2,((int)(m.heightPixels*scale)/2)*2);recorder.setVideoEncoder(MediaRecorder.VideoEncoder.H264);recorder.setVideoSize(width,height);recorder.setVideoFrameRate(30);recorder.setVideoEncodingBitRate(4000000);recorder.prepare();
        Intent permission=intent.getParcelableExtra("permission");if(permission==null)throw new Exception("Chưa cho phép quay màn hình.");
        projection=((MediaProjectionManager)getSystemService(MEDIA_PROJECTION_SERVICE)).getMediaProjection(Activity.RESULT_OK,permission);
        projection.registerCallback(new MediaProjection.Callback(){@Override public void onStop(){finish();}},handler);
        display=projection.createVirtualDisplay("GocHopAm performance",width,height,m.densityDpi,DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,recorder.getSurface(),null,handler);
      }else recorder.prepare();
      recorder.start();active=true;event("recording",null);
    }catch(Exception e){event("error",e.getMessage()==null?"Chưa bắt đầu được bản ghi.":e.getMessage());cleanup();stopSelf();}
    return START_NOT_STICKY;
  }
  private void finish(){if(stopping)return;stopping=true;boolean saved=false;try{if(recorder!=null&&active){recorder.stop();saved=output!=null&&output.length()>0&&output.renameTo(finalOutput);}}catch(Exception ignored){}cleanup();event(saved?"stopped":"error",saved?null:"Bản ghi quá ngắn hoặc chưa có dữ liệu. Hãy thử lại.");stopSelf();}
  private void cleanup(){active=false;activeName=null;if(display!=null){display.release();display=null;}if(projection!=null){projection.stop();projection=null;}if(recorder!=null){recorder.release();recorder=null;}stopForeground(true);}
  @Override public void onDestroy(){if(active&&!stopping)finish();else cleanup();super.onDestroy();}
}
