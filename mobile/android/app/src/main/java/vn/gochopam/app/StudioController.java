package vn.gochopam.app;
import android.Manifest;
import android.app.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.media.projection.MediaProjectionManager;
import android.net.Uri;
import android.os.*;
import android.util.Base64;
import android.webkit.PermissionRequest;
import java.io.*;
import java.lang.ref.WeakReference;
import java.util.*;
import org.json.*;

final class StudioController {
  private final MainActivity activity;
  private final CameraRecorder camera;
  private static WeakReference<StudioController> current=new WeakReference<>(null);
  private String pendingId,pendingAction,pendingSave,pendingStop;
  private JSONObject pendingArgs;
  private boolean permissionPending;
  private int armed;
  private File streamFile,finalStreamFile;
  private String streamId;
  private FileOutputStream stream;
  private long streamBytes;
  StudioController(MainActivity a){activity=a;camera=new CameraRecorder(a,this::event);current=new WeakReference<>(this);}
  boolean pending(){return permissionPending;}
  boolean busy(){return StudioService.active||stream!=null||camera.busy();}
  static void notifyEvent(JSONObject value){StudioController c=current.get();if(c!=null)c.activity.runOnUiThread(()->c.event(value));}
  private void event(JSONObject value){String state=value.optString("state");if("recording".equals(state)){if(pendingId!=null){activity.reply(pendingId,true,true);pendingId=null;}permissionPending=false;}
    if("stopped".equals(state)||"error".equals(state)){activity.setRequestedOrientation(android.content.pm.ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);if(pendingId!=null){activity.reply(pendingId,false,value.optString("error","Đã dừng."));pendingId=null;}if(pendingStop!=null){activity.reply(pendingStop,!"error".equals(state),value.optString("error","Đã lưu bản ghi."));pendingStop=null;}permissionPending=false;}
    activity.emit("GocRecordingEvent",value);
  }
  void start(String id,String action,JSONObject args){if(pendingId!=null||busy()){activity.reply(id,false,"Đã có một bản ghi hoặc yêu cầu đang chạy.");return;}pendingId=id;pendingAction=action;pendingArgs=args;permissionPending=true;activity.stopSpeech();
    ArrayList<String> permissions=new ArrayList<>();boolean audio=args.optBoolean("audio",true),camera=args.optBoolean("camera",false)||"camera".equals(args.optString("mode"));
    if(audio&&activity.checkSelfPermission(Manifest.permission.RECORD_AUDIO)!=PackageManager.PERMISSION_GRANTED)permissions.add(Manifest.permission.RECORD_AUDIO);
    if(camera&&activity.checkSelfPermission(Manifest.permission.CAMERA)!=PackageManager.PERMISSION_GRANTED)permissions.add(Manifest.permission.CAMERA);
    if(!permissions.isEmpty())activity.requestPermissions(permissions.toArray(new String[0]),1210);else granted();
  }
  void permissions(int code,String[] names,int[] results){if(code!=1210)return;for(int result:results)if(result!=PackageManager.PERMISSION_GRANTED){fail("Chưa được cho phép camera hoặc micro.");return;}granted();}
  private void fail(String message){if(pendingId!=null)activity.reply(pendingId,false,message);pendingId=null;permissionPending=false;}
  private void granted(){try{
    if("recordPermission".equals(pendingAction)){armed=(pendingArgs.optBoolean("audio",true)?1:0)|(pendingArgs.optBoolean("camera",false)?2:0);activity.reply(pendingId,true,true);pendingId=null;permissionPending=false;}
    else if("recordScreenStart".equals(pendingAction)){activity.startActivityForResult(((MediaProjectionManager)activity.getSystemService(Context.MEDIA_PROJECTION_SERVICE)).createScreenCaptureIntent(),1211);}
    else if("camera".equals(pendingArgs.optString("mode")))camera.start();
    else startService(null);
  }catch(Exception e){fail("Không mở được yêu cầu ghi trên thiết bị.");}}
  void webPermission(PermissionRequest request){activity.runOnUiThread(()->{ArrayList<String> allowed=new ArrayList<>();if("https://app.gochopam.local".equals(request.getOrigin().toString().replaceAll("/$",""))){for(String r:request.getResources()){if(PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(r)&&(armed&1)!=0&&activity.checkSelfPermission(Manifest.permission.RECORD_AUDIO)==PackageManager.PERMISSION_GRANTED)allowed.add(r);if(PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(r)&&(armed&2)!=0&&activity.checkSelfPermission(Manifest.permission.CAMERA)==PackageManager.PERMISSION_GRANTED)allowed.add(r);}}armed=0;if(allowed.size()==request.getResources().length)request.grant(allowed.toArray(new String[0]));else request.deny();});}
  boolean activityResult(int code,int result,Intent data){if(code==1211){if(result!=Activity.RESULT_OK||data==null)fail("Bạn chưa cho phép quay màn hình.");else startService(data);return true;}if(code==1212){if(result==Activity.RESULT_OK&&data!=null&&pendingSave!=null){try{File f=safeFile(pendingSave);try(InputStream in=new FileInputStream(f);OutputStream out=activity.getContentResolver().openOutputStream(data.getData())){byte[] b=new byte[16384];int n;while((n=in.read(b))>0)out.write(b,0,n);}}catch(Exception e){activity.emit("GocRecordingEvent",error("Chưa lưu được bản sao."));}}pendingSave=null;return true;}return false;}
  private void startService(Intent permission){try{activity.setRequestedOrientation(android.content.pm.ActivityInfo.SCREEN_ORIENTATION_LOCKED);Intent intent=new Intent(activity,StudioService.class).putExtra("screen",permission!=null);if(permission!=null)intent.putExtra("permission",permission);activity.startForegroundService(intent);}catch(Exception e){fail("Chưa khởi động được bộ ghi. Hãy mở lại ứng dụng rồi thử.");}}
  void onPause(){if(!permissionPending&&camera.busy())camera.stop();}
  void stop(String id){if(camera.busy()){pendingStop=id;camera.stop();return;}if(!StudioService.active){activity.reply(id,true,true);return;}pendingStop=id;activity.startService(new Intent(activity,StudioService.class).setAction("STOP"));}
  synchronized JSONObject create(JSONObject args)throws Exception{if(busy())throw new Exception("Đã có bản ghi đang chạy.");String mime=args.getString("mime");if(!mime.matches("(?:audio|video)/(?:webm|mp4)(?:;codecs=[a-z0-9,.-]+)?"))throw new Exception("Định dạng không được hỗ trợ.");streamId=UUID.randomUUID().toString();String ext=mime.startsWith("audio/mp4")?"m4a":mime.contains("mp4")?"mp4":"webm";finalStreamFile=new File(StudioService.directory(activity),"GocHopAm-"+System.currentTimeMillis()+"-"+streamId.substring(0,8)+"."+ext);streamFile=new File(finalStreamFile.getPath()+".part");stream=new FileOutputStream(streamFile);streamBytes=0;return new JSONObject().put("id",streamId);}
  synchronized void chunk(JSONObject args)throws Exception{if(stream==null||!args.optString("id").equals(streamId))throw new Exception("Bản ghi không còn hoạt động.");String encoded=args.getString("data");if(encoded.length()>600000)throw new Exception("Gói dữ liệu quá lớn.");byte[] data=Base64.decode(encoded,Base64.DEFAULT);if(streamBytes+data.length>300000000)throw new Exception("Bản ghi đã đạt giới hạn dung lượng.");stream.write(data);streamBytes+=data.length;}
  synchronized void abort(){try{if(stream!=null)stream.close();}catch(Exception ignored){}stream=null;streamId=null;if(streamFile!=null)streamFile.delete();streamFile=null;finalStreamFile=null;}
  synchronized void finish(JSONObject args)throws Exception{if(stream==null||!args.optString("id").equals(streamId))throw new Exception("Bản ghi không hợp lệ.");stream.close();stream=null;streamId=null;if(streamBytes==0)throw new Exception("Bản ghi chưa có dữ liệu.");if(!streamFile.renameTo(finalStreamFile))throw new Exception("Chưa hoàn tất tệp bản ghi.");streamFile=null;finalStreamFile=null;}
  JSONArray list(){JSONArray result=new JSONArray();File[] files=StudioService.directory(activity).listFiles();if(files==null)return result;Arrays.sort(files,(a,b)->Long.compare(b.lastModified(),a.lastModified()));for(File file:files){if(file.getName().matches("GocHopAm-[A-Za-z0-9.-]+\\.(mp4|m4a|webm)")&&file.isFile()&&file.length()>0&&!file.getName().equals(StudioService.activeName)&&(streamFile==null||!file.getName().equals(streamFile.getName())))try{result.put(new JSONObject().put("name",file.getName()).put("bytes",file.length()));}catch(Exception ignored){}if(result.length()>=100)break;}return result;}
  private File safeFile(String name)throws Exception{if(!name.matches("GocHopAm-[A-Za-z0-9.-]+\\.(mp4|m4a|webm)"))throw new Exception("Tệp không hợp lệ.");File f=new File(StudioService.directory(activity),name);if(!f.isFile())throw new Exception("Không tìm thấy bản ghi.");return f;}
  void share(String id,JSONObject args,boolean save){try{File file=safeFile(args.getString("name"));String mime=file.getName().endsWith(".m4a")?"audio/mp4":file.getName().endsWith(".webm")?"video/webm":"video/mp4";
    if(save){pendingSave=file.getName();Intent intent=new Intent(Intent.ACTION_CREATE_DOCUMENT).setType(mime).addCategory(Intent.CATEGORY_OPENABLE).putExtra(Intent.EXTRA_TITLE,file.getName());activity.startActivityForResult(intent,1212);}
    else{Uri uri=Uri.parse("content://"+activity.getPackageName()+".recordings/"+file.getName());Intent intent=new Intent(Intent.ACTION_SEND).setType(mime).putExtra(Intent.EXTRA_STREAM,uri).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);intent.setClipData(ClipData.newRawUri("Góc Hợp Âm",uri));activity.startActivity(Intent.createChooser(intent,"Chia sẻ phần trình diễn"));}
    activity.reply(id,true,true);
  }catch(Exception e){activity.reply(id,false,e.getMessage());}}
  private JSONObject error(String message){try{return new JSONObject().put("error",message);}catch(Exception e){return new JSONObject();}}
}
