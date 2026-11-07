package vn.gochopam.app;
import android.Manifest;
import android.content.*;
import android.content.pm.PackageManager;
import android.os.*;
import android.speech.*;
import java.util.ArrayList;
import org.json.JSONObject;

/** On-device recognition only; unsupported devices never silently use a cloud recognizer. */
final class SingingController implements RecognitionListener {
  private final MainActivity activity;
  private SpeechRecognizer recognizer;
  private boolean running,pending;
  private String requestId;
  private int misses;
  private final Handler handler=new Handler(Looper.getMainLooper());
  SingingController(MainActivity a){activity=a;}
  boolean pending(){return pending;}
  void start(String id){if(activity.studioBusy()){activity.reply(id,false,"Micro đang dành cho bản ghi. Hãy dùng theo mốc thời gian.");return;}stop();requestId=id;
    if(Build.VERSION.SDK_INT<31||!SpeechRecognizer.isOnDeviceRecognitionAvailable(activity)){activity.reply(id,false,"Thiết bị chưa có nhận giọng trên máy. Hãy dùng mốc LRC hoặc đánh dấu câu.");requestId=null;return;}
    if(activity.checkSelfPermission(Manifest.permission.RECORD_AUDIO)!=PackageManager.PERMISSION_GRANTED){pending=true;activity.requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO},1215);}else begin();
  }
  void permissions(int code,int[] values){if(code!=1215)return;pending=false;if(values.length==0||values[0]!=PackageManager.PERMISSION_GRANTED){if(requestId!=null)activity.reply(requestId,false,"Chưa cho phép dùng micro để theo lời.");requestId=null;return;}begin();}
  private void begin(){try{recognizer=SpeechRecognizer.createOnDeviceSpeechRecognizer(activity);recognizer.setRecognitionListener(this);running=true;misses=0;listen();if(requestId!=null)activity.reply(requestId,true,true);requestId=null;}catch(Exception e){error("Chưa mở được nhận giọng trên máy.");}}
  private void listen(){if(!running||recognizer==null)return;Intent intent=new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL,RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE,"vi-VN");intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS,true);intent.putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE,true);try{recognizer.startListening(intent);}catch(Exception e){error("Thiết bị chưa nhận được giọng hát tiếng Việt trên máy.");}}
  void stop(){running=false;pending=false;handler.removeCallbacksAndMessages(null);if(recognizer!=null){recognizer.cancel();recognizer.destroy();recognizer=null;}requestId=null;}
  private void error(String text){if(requestId!=null)activity.reply(requestId,false,text);try{activity.emit("GocSpeechEvent",new JSONObject().put("error",text));}catch(Exception ignored){}stop();}
  private void result(Bundle result){ArrayList<String> values=result.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);if(values!=null&&!values.isEmpty())try{activity.emit("GocSpeechEvent",new JSONObject().put("text",values.get(0)));misses=0;}catch(Exception ignored){}}
  @Override public void onResults(Bundle result){result(result);if(running)handler.postDelayed(()->listen(),250);}
  @Override public void onPartialResults(Bundle result){result(result);}
  @Override public void onError(int code){if(!running)return;if((code==SpeechRecognizer.ERROR_NO_MATCH||code==SpeechRecognizer.ERROR_SPEECH_TIMEOUT)&&++misses<5)handler.postDelayed(()->listen(),350);else error(code==12||code==13?"Máy chưa có mô hình tiếng Việt phù hợp. Dùng mốc thời gian hoặc đánh dấu câu.":"Chưa nhận rõ giọng hát. Chọn lại Nhận giọng để thử, hoặc dùng mốc thời gian.");}
  @Override public void onReadyForSpeech(Bundle b){} @Override public void onBeginningOfSpeech(){} @Override public void onRmsChanged(float v){} @Override public void onBufferReceived(byte[] b){} @Override public void onEndOfSpeech(){} @Override public void onEvent(int e,Bundle b){}
}
