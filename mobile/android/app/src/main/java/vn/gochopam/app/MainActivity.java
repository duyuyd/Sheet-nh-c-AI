package vn.gochopam.app;

import android.app.Activity;
import android.os.Bundle;
import android.os.Build;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.media.AudioManager;
import android.media.ToneGenerator;
import android.util.AtomicFile;
import android.view.WindowManager;
import android.view.WindowInsets;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Button;
import android.webkit.WebChromeClient;
import android.webkit.WebMessage;
import android.webkit.WebMessagePort;
import android.content.res.Configuration;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import org.json.JSONObject;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.concurrent.Executors;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;

/** Bundled UI; only public, read-only music endpoints may cross the bridge. */
public final class MainActivity extends Activity {
  private static final String LOCAL = "https://app.gochopam.local/";
  private static final String API = "https://goc-hop-am.onwardcrust.chatgpt.site";
  private WebView web;
  private WebView printWeb;
  private android.app.Dialog siteDialog;
  private WebView siteWeb;
  private String textRequest=null;
  private byte[] textOutput;
  private boolean printing=false;
  private int videoExtent=200;
  private boolean readingAudio=false;
  private LinearLayout layout,videoPanel;
  private WebView videoWeb;
  private StudioController studio;
  private SingingController singing;
  private WebMessagePort[] videoPorts;
  private final boolean[] landscape={false};
  private final ExecutorService network = Executors.newFixedThreadPool(3);
  private final ScheduledExecutorService clock = Executors.newSingleThreadScheduledExecutor();
  private ScheduledFuture<?> beatTask;
  private ToneGenerator tone;
  private int beat;
  private volatile boolean destroyed;

  @Override public void onCreate(Bundle state) {
    super.onCreate(state);
    studio=new StudioController(this);singing=new SingingController(this);
    web = new WebView(this);
    web.setBackgroundColor(Color.rgb(23,19,30));
    landscape[0]=getResources().getConfiguration().orientation==android.content.res.Configuration.ORIENTATION_LANDSCAPE;
    layout=new LinearLayout(this);layout.setOrientation(landscape[0]?LinearLayout.HORIZONTAL:LinearLayout.VERTICAL);layout.setBackgroundColor(Color.rgb(33,25,46));
    layout.addView(web,new LinearLayout.LayoutParams(landscape[0]?0:LinearLayout.LayoutParams.MATCH_PARENT,landscape[0]?LinearLayout.LayoutParams.MATCH_PARENT:0,1));
    setContentView(layout);
    layout.setOnApplyWindowInsetsListener((view,insets)->{
      if(Build.VERSION.SDK_INT>=30){
        android.graphics.Insets bars=insets.getInsets(WindowInsets.Type.systemBars()|WindowInsets.Type.displayCutout());
        view.setPadding(bars.left,bars.top,bars.right,bars.bottom);
      }else view.setPadding(insets.getSystemWindowInsetLeft(),insets.getSystemWindowInsetTop(),insets.getSystemWindowInsetRight(),insets.getSystemWindowInsetBottom());
      return insets;
    });
    WebSettings settings=web.getSettings();
    settings.setJavaScriptEnabled(true);
    settings.setDomStorageEnabled(true);
    settings.setAllowFileAccess(false);
    settings.setAllowContentAccess(false);
    settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
    settings.setSupportMultipleWindows(false);
    settings.setMediaPlaybackRequiresUserGesture(true);
    android.webkit.CookieManager.getInstance().setAcceptCookie(false);
    android.webkit.CookieManager.getInstance().setAcceptThirdPartyCookies(web,false);
    web.addJavascriptInterface(new Bridge(),"GocAndroid");
    web.setWebChromeClient(new WebChromeClient(){@Override public void onPermissionRequest(android.webkit.PermissionRequest request){studio.webPermission(request);}});
    web.setWebViewClient(new WebViewClient(){
      @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request){return true;}
      @Override public WebResourceResponse shouldInterceptRequest(WebView view,WebResourceRequest request){
        Uri u=request.getUrl();
        if(!"https".equals(u.getScheme())||!"app.gochopam.local".equals(u.getHost()))return blocked();
        String path=u.getPath();
        String name="/".equals(path)?"index.html":path==null?"":path.substring(1);
        if(!name.matches("index\\.html|bundle\\.js|app\\.css|icon\\.svg"))return blocked();
        String mime=name.endsWith(".js")?"application/javascript":name.endsWith(".css")?"text/css":name.endsWith(".svg")?"image/svg+xml":"text/html";
        try{return new WebResourceResponse(mime,"UTF-8",200,"OK",Collections.singletonMap("Cache-Control","no-store"),getAssets().open(name));}catch(Exception e){return blocked();}
      }
    });
    if(Build.VERSION.SDK_INT>=33)getOnBackInvokedDispatcher().registerOnBackInvokedCallback(android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT,()->back());
    web.loadUrl(LOCAL);
  }
  private WebResourceResponse blocked(){return new WebResourceResponse("text/plain","UTF-8",404,"Not Found",Collections.emptyMap(),new ByteArrayInputStream(new byte[0]));}
  private void back(){if(videoWeb!=null){closeVideo(true);return;}web.evaluateJavascript("window.GocBack ? window.GocBack() : false",value->{if(!"true".equals(value))finish();});}
  private int dp(int value){return Math.round(value*getResources().getDisplayMetrics().density);}
  private void closeVideo(boolean notify){
    if(videoPorts!=null){for(WebMessagePort p:videoPorts)p.close();videoPorts=null;}
    if(videoWeb!=null){videoWeb.stopLoading();videoWeb.loadUrl("about:blank");videoWeb.onPause();videoWeb.destroy();videoWeb=null;}
    if(videoPanel!=null){layout.removeView(videoPanel);videoPanel=null;}
    if(notify&&!destroyed)web.evaluateJavascript("window.GocVideoClosed && window.GocVideoClosed()",null);
  }
  private void showVideo(String id)throws Exception{
    if(!id.matches("[A-Za-z0-9_-]{11}"))throw new Exception("Video không hợp lệ.");
    closeVideo(false);stopMetro();
    videoPanel=new LinearLayout(this);videoPanel.setOrientation(LinearLayout.VERTICAL);videoPanel.setBackgroundColor(Color.BLACK);
    videoWeb=new WebView(this);WebSettings settings=videoWeb.getSettings();settings.setJavaScriptEnabled(true);settings.setDomStorageEnabled(true);settings.setAllowFileAccess(false);settings.setAllowContentAccess(false);settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);settings.setMediaPlaybackRequiresUserGesture(true);videoWeb.setWebChromeClient(new WebChromeClient());
    final String appHost=getPackageName().toLowerCase(java.util.Locale.ROOT),origin="https://"+appHost;
    videoWeb.setWebViewClient(new WebViewClient(){
      @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request){if(!request.isForMainFrame())return false;Uri u=request.getUrl();return !("about".equals(u.getScheme())||("https".equals(u.getScheme())&&(appHost.equals(u.getHost())||(("www.youtube-nocookie.com".equals(u.getHost())||"www.youtube.com".equals(u.getHost()))&&u.getPath()!=null&&u.getPath().startsWith("/embed/")))));}
      @Override public void onPageFinished(WebView view,String url){if(videoWeb!=view||videoPorts!=null)return;videoPorts=view.createWebMessageChannel();videoPorts[0].setWebMessageCallback(new WebMessagePort.WebMessageCallback(){@Override public void onMessage(WebMessagePort port,WebMessage message){try{String raw=message.getData();if(raw==null||raw.length()>1500)return;JSONObject v=new JSONObject(raw);double time=v.optDouble("time",-1);if(id.equals(v.optString("id"))&&Double.isFinite(time)&&time>=0&&time<86400)emit("GocVideoTick",v);}catch(Exception ignored){}}});view.postWebMessage(new WebMessage("goc:connect",new WebMessagePort[]{videoPorts[1]}),Uri.parse(origin));}
    });
    videoPanel.addView(videoWeb,new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT,LinearLayout.LayoutParams.MATCH_PARENT));
    layout.addView(videoPanel,0);arrange();
    String config=new JSONObject().put("id",id).put("origin",origin).toString();
    String html=new String(read(getAssets().open("player.html"),200000),StandardCharsets.UTF_8).replace("<script id=\"goc-player-config\" type=\"application/json\">{}</script>","<script id=\"goc-player-config\" type=\"application/json\">"+config+"</script>").replace("<script src=\"player.js?v=121\"></script>","<script>"+new String(read(getAssets().open("player.js"),200000),StandardCharsets.UTF_8)+"</script>");
    videoWeb.loadDataWithBaseURL(origin+"/",html,"text/html","UTF-8",null);
  }
  private void arrange(){landscape[0]=getResources().getConfiguration().orientation==Configuration.ORIENTATION_LANDSCAPE;layout.setOrientation(landscape[0]?LinearLayout.HORIZONTAL:LinearLayout.VERTICAL);web.setLayoutParams(new LinearLayout.LayoutParams(landscape[0]?0:LinearLayout.LayoutParams.MATCH_PARENT,landscape[0]?LinearLayout.LayoutParams.MATCH_PARENT:0,1));if(videoPanel!=null)videoPanel.setLayoutParams(new LinearLayout.LayoutParams(landscape[0]?Math.max(dp(220),Math.min(getResources().getDisplayMetrics().widthPixels*2/3,dp(videoExtent))):LinearLayout.LayoutParams.MATCH_PARENT,landscape[0]?LinearLayout.LayoutParams.MATCH_PARENT:dp(videoExtent)));}
  @Override public void onConfigurationChanged(Configuration value){super.onConfigurationChanged(value);arrange();}
  void emit(String hook,JSONObject value){if(!destroyed)web.evaluateJavascript("window."+hook+" && window."+hook+"("+value.toString()+")",null);}
  void stopSpeech(){if(singing!=null)singing.stop();}
  boolean studioBusy(){return studio!=null&&studio.busy();}
  @Override public void onRequestPermissionsResult(int code,String[] names,int[] results){super.onRequestPermissionsResult(code,names,results);studio.permissions(code,names,results);singing.permissions(code,results);}
  @Override protected void onActivityResult(int code,int result,Intent data){super.onActivityResult(code,result,data);if(code==501||code==502){final String requestId=textRequest;final byte[] output=textOutput;final boolean audio=readingAudio;readingAudio=false;textRequest=null;textOutput=null;if(requestId==null)return;if(result!=RESULT_OK||data==null||data.getData()==null){reply(requestId,true,"");return;}final Uri uri=data.getData();network.execute(()->{try{if(code==501){try(InputStream in=getContentResolver().openInputStream(uri)){if(audio)reply(requestId,true,new JSONObject().put("base64",android.util.Base64.encodeToString(read(in,3000000),android.util.Base64.NO_WRAP)));else reply(requestId,true,new String(read(in,250000),StandardCharsets.UTF_8));}}else{try(java.io.OutputStream out=getContentResolver().openOutputStream(uri)){if(out==null||output==null)throw new Exception();out.write(output);}reply(requestId,true,true);}}catch(Exception e){reply(requestId,false,"Chưa đọc hoặc lưu được tệp văn bản (tối đa 250 KB).");}});return;}studio.activityResult(code,result,data);}
  @SuppressWarnings("deprecation") @Override public void onBackPressed(){back();}
  void reply(String id,boolean ok,Object value){
    final String encoded=value==null?"null":value instanceof JSONObject?value.toString():value instanceof Boolean?value.toString():JSONObject.quote(String.valueOf(value));
    runOnUiThread(()->{if(!destroyed)web.evaluateJavascript("window.GocNativeReply && window.GocNativeReply("+JSONObject.quote(id)+","+ok+","+encoded+")",null);});
  }
  private static byte[] read(InputStream stream,int limit)throws Exception{
    try(InputStream in=stream;ByteArrayOutputStream out=new ByteArrayOutputStream()){
      byte[] buffer=new byte[8192];int n;while((n=in.read(buffer))!=-1){if(out.size()+n>limit)throw new Exception("Dữ liệu vượt dung lượng cho phép.");out.write(buffer,0,n);}return out.toByteArray();
    }
  }
  private JSONObject api(String path)throws Exception{
    if(path.length()>2000||!path.matches("/api/(catalog|reader|video-captions)\\?[^\\r\\n#]*"))throw new Exception("Yêu cầu không hợp lệ.");
    HttpURLConnection c=null;
    try{
      c=(HttpURLConnection)new URL(API+path).openConnection();
      c.setConnectTimeout(8000);c.setReadTimeout(15000);c.setInstanceFollowRedirects(false);
      c.setRequestProperty("Accept","application/json");
      c.setRequestProperty("User-Agent","GocHopAmAndroid/1.3.1");
      int code=c.getResponseCode();
      if(code!=200)throw new Exception("Sites trả HTTP "+code+" cho kho bài.");
      String type=c.getContentType();
      if(type==null||!type.toLowerCase(java.util.Locale.ROOT).contains("json"))throw new Exception("Sites chưa trả JSON của kho bài.");
      return new JSONObject(new String(read(c.getInputStream(),2000000),StandardCharsets.UTF_8));
    }finally{if(c!=null)c.disconnect();}
  }
  private void showSite(String query){
    if(siteDialog!=null)siteDialog.dismiss();
    android.app.Dialog dialog=new android.app.Dialog(this);
    LinearLayout panel=new LinearLayout(this);panel.setOrientation(LinearLayout.VERTICAL);
    panel.setBackgroundColor(Color.rgb(33,25,46));
    Button close=new Button(this);close.setText("← Đóng kho bài Sites");
    panel.addView(close,new LinearLayout.LayoutParams(-1,dp(52)));
    WebView browser=new WebView(this);browser.setBackgroundColor(Color.WHITE);
    WebSettings settings=browser.getSettings();settings.setJavaScriptEnabled(true);settings.setDomStorageEnabled(true);
    settings.setAllowFileAccess(false);settings.setAllowContentAccess(false);
    settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
    browser.setWebViewClient(new WebViewClient(){
      @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request){
        Uri url=request.getUrl();
        if("https".equals(url.getScheme())&&"goc-hop-am.onwardcrust.chatgpt.site".equals(url.getHost()))return false;
        if("https".equals(url.getScheme()))startActivity(new Intent(Intent.ACTION_VIEW,url));
        return true;
      }
    });
    panel.addView(browser,new LinearLayout.LayoutParams(-1,0,1));
    dialog.setContentView(panel);siteWeb=browser;siteDialog=dialog;
    close.setOnClickListener(v->dialog.dismiss());
    dialog.setOnDismissListener(d->{browser.stopLoading();browser.destroy();if(siteWeb==browser)siteWeb=null;if(siteDialog==dialog)siteDialog=null;});
    dialog.show();if(dialog.getWindow()!=null)dialog.getWindow().setLayout(-1,-1);
    String safe=query==null?"":query.substring(0,Math.min(120,query.length()));
    browser.loadUrl(API+"/?q="+Uri.encode(safe));
  }
  private synchronized String loadLibrary()throws Exception{
    AtomicFile file=new AtomicFile(new File(getFilesDir(),"offline-v1.json"));
    if(!file.getBaseFile().exists())return "{}";
    return new String(read(file.openRead(),2000000),StandardCharsets.UTF_8);
  }
  private synchronized void saveLibrary(String value)throws Exception{
    byte[] data=value.getBytes(StandardCharsets.UTF_8);if(data.length>2000000)throw new Exception("Thư viện ngoại tuyến đã đầy.");
    JSONObject object=new JSONObject(value);if(object.length()>100)throw new Exception("Chỉ lưu tối đa 100 bài trên máy.");
    AtomicFile file=new AtomicFile(new File(getFilesDir(),"offline-v1.json"));FileOutputStream output=null;
    try{output=file.startWrite();output.write(data);file.finishWrite(output);}catch(Exception e){if(output!=null)file.failWrite(output);throw e;}
  }
  private void stopMetro(){if(beatTask!=null){beatTask.cancel(false);beatTask=null;}if(tone!=null)tone.stopTone();}
  private void startMetro(int bpm,int beats){
    stopMetro();if(tone==null)tone=new ToneGenerator(AudioManager.STREAM_MUSIC,75);beat=0;
    beatTask=clock.scheduleAtFixedRate(()->{
      final int index=beat;ToneGenerator currentTone=tone;if(currentTone!=null)currentTone.startTone(index==0?ToneGenerator.TONE_PROP_BEEP2:ToneGenerator.TONE_PROP_BEEP,55);
      runOnUiThread(()->{if(!destroyed&&beatTask!=null)web.evaluateJavascript("window.GocNativeBeat && window.GocNativeBeat("+index+")",null);});
      beat=(beat+1)%beats;
    },0,60000000L/bpm,TimeUnit.MICROSECONDS);
  }
  private final class Bridge {
    @JavascriptInterface public void postMessage(String raw){
      if(destroyed||raw==null||raw.length()>2100000)return;
      String id;
      try{
        JSONObject message=new JSONObject(raw);id=message.getString("id");if(!id.matches("[0-9]{1,12}"))return;
        final String requestId=id,action=message.getString("action");final JSONObject args=message.optJSONObject("args")==null?new JSONObject():message.getJSONObject("args");
        if(action.equals("recordCreate")||action.equals("recordChunk")||action.equals("recordFinish")||action.equals("recordAbort")||action.equals("settingsLoad")||action.equals("settingsSave")){network.execute(()->{try{if(action.equals("recordCreate"))reply(requestId,true,studio.create(args));else if(action.equals("recordChunk")){studio.chunk(args);reply(requestId,true,true);}else if(action.equals("recordAbort")){studio.abort();reply(requestId,true,true);}else if(action.equals("recordFinish")){studio.finish(args);reply(requestId,true,true);}else if(action.equals("settingsLoad")){File f=new File(getFilesDir(),"follow-v2.json");reply(requestId,true,f.exists()?new String(read(new java.io.FileInputStream(f),250000),StandardCharsets.UTF_8):"{}");}else{String v=args.getString("value");if(v.length()>200000)throw new Exception("Quá nhiều mốc lời.");new JSONObject(v);try(FileOutputStream out=openFileOutput("follow-v2.json",0)){out.write(v.getBytes(StandardCharsets.UTF_8));}reply(requestId,true,true);}}catch(Exception e){reply(requestId,false,e.getMessage());}});}
        else if(action.equals("api")||action.equals("load")||action.equals("save")){
          network.execute(()->{try{if(action.equals("api"))reply(requestId,true,api(args.getString("path")));else if(action.equals("load"))reply(requestId,true,loadLibrary());else{saveLibrary(args.getString("value"));reply(requestId,true,true);}}catch(Exception e){reply(requestId,false,e.getMessage());}});
        }else runOnUiThread(()->{try{
          switch(action){
            case "videoLayout":videoExtent=Math.max(200,Math.min(420,args.optInt("size",200)));arrange();break;
            case "sheetSource":String source=args.optString("source"),target=source.equals("musescore")?"https://musescore.com/sheetmusic":source.equals("imslp")?"https://imslp.org/":source.equals("musopen")?"https://musopen.org/sheetmusic/":null;if(target==null)throw new Exception();startActivity(new Intent(Intent.ACTION_VIEW,Uri.parse(target)));break;
            case "readAudio":if(textRequest!=null)throw new Exception();textRequest=requestId;readingAudio=true;Intent pickAudio=new Intent(Intent.ACTION_OPEN_DOCUMENT);pickAudio.setType("audio/*");pickAudio.addCategory(Intent.CATEGORY_OPENABLE);try{startActivityForResult(pickAudio,501);}catch(Exception e){textRequest=null;readingAudio=false;throw e;}return;
            case "readText":if(textRequest!=null)throw new Exception();textRequest=requestId;Intent pickText=new Intent(Intent.ACTION_OPEN_DOCUMENT);pickText.setType("*/*");pickText.addCategory(Intent.CATEGORY_OPENABLE);try{startActivityForResult(pickText,501);}catch(Exception e){textRequest=null;throw e;}return;
            case "saveText":if(textRequest!=null)throw new Exception();String fileText=args.getString("text"),fileName=args.optString("name","Goc_Hop_Am_Sheet.json");if(fileText.getBytes(StandardCharsets.UTF_8).length>250000||!fileName.matches("[A-Za-z0-9_-]{1,80}\\.(?:json|musicxml)"))throw new Exception();textRequest=requestId;textOutput=fileText.getBytes(StandardCharsets.UTF_8);Intent saveText=new Intent(Intent.ACTION_CREATE_DOCUMENT);saveText.setType(fileName.endsWith(".musicxml")?"application/vnd.recordare.musicxml+xml":"application/json");saveText.addCategory(Intent.CATEGORY_OPENABLE);saveText.putExtra(Intent.EXTRA_TITLE,fileName);try{startActivityForResult(saveText,502);}catch(Exception e){textRequest=null;textOutput=null;throw e;}return;
            case "printSheet":String html=args.getString("html");if(html.length()>500000)throw new Exception();if(printWeb!=null)printWeb.destroy();printing=true;printWeb=new WebView(MainActivity.this);printWeb.getSettings().setAllowFileAccess(false);printWeb.getSettings().setAllowContentAccess(false);printWeb.setWebViewClient(new WebViewClient(){@Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request){return true;}@Override public void onPageFinished(WebView view,String url){android.print.PrintManager manager=(android.print.PrintManager)getSystemService(PRINT_SERVICE);manager.print("Góc Hợp Âm - Sheet",view.createPrintDocumentAdapter("Goc_Hop_Am_Sheet"),new android.print.PrintAttributes.Builder().setMediaSize(android.print.PrintAttributes.MediaSize.ISO_A4).build());}});printWeb.loadDataWithBaseURL(LOCAL,html,"text/html","UTF-8",null);break;
            case "recordPermission":case "recordScreenStart":case "recordStart":studio.start(requestId,action,args);return;
            case "recordStop":studio.stop(requestId);return;
            case "recordings":reply(requestId,true,new JSONObject().put("items",studio.list()));return;
            case "recordShare":case "recordSave":studio.share(requestId,args,action.equals("recordSave"));return;
            case "speechStart":singing.start(requestId);return;
            case "speechStop":singing.stop();break;
            case "video":showVideo(args.getString("id"));break;
            case "videoClose":closeVideo(false);break;
            case "videoExternal":String videoId=args.optString("id","");if(!videoId.matches("[A-Za-z0-9_-]{11}"))throw new Exception("Video không hợp lệ.");closeVideo(true);startActivity(new Intent(Intent.ACTION_VIEW,Uri.parse("https://www.youtube.com/watch?v="+videoId)));break;
            case "awake":if(args.optBoolean("enabled"))getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);break;
            case "metronome":if(args.optBoolean("running")){int bpm=Math.max(40,Math.min(240,args.optInt("bpm",80))),beats=args.optInt("beats",4);if(beats!=2&&beats!=3&&beats!=4&&beats!=6)beats=4;startMetro(bpm,beats);}else stopMetro();break;
            case "share":String text=args.optString("text","");String sharedUrl=args.optString("url","");if(!sharedUrl.isEmpty()){Uri link=Uri.parse(sharedUrl);if(!"https".equals(link.getScheme())||!"goc-hop-am.onwardcrust.chatgpt.site".equals(link.getHost())||!"/".equals(link.getPath()))throw new Exception("Liên kết không hợp lệ.");text+="\n"+sharedUrl;}if(text.length()>2000)throw new Exception("Nội dung quá dài.");Intent send=new Intent(Intent.ACTION_SEND);send.setType("text/plain");send.putExtra(Intent.EXTRA_TEXT,text);startActivity(Intent.createChooser(send,"Chia sẻ bài hát"));break;
            case "siteOpen":showSite(args.optString("q",""));break;
            case "github":startActivity(new Intent(Intent.ACTION_VIEW,Uri.parse("https://github.com/duyuyd/goc-hop-am")));break;
            case "help":startActivity(new Intent(Intent.ACTION_VIEW,Uri.parse(API+"/huong-dan")));break;
            default:throw new Exception("Thao tác không được hỗ trợ.");
          }reply(requestId,true,true);
        }catch(Exception e){reply(requestId,false,"Chưa thực hiện được thao tác trên thiết bị.");}});
      }catch(Exception ignored){}
    }
  }
  @Override public void onPause(){super.onPause();studio.onPause();if(studio.pending()||singing.pending()||textRequest!=null||printing){return;}stopSpeech();closeVideo(true);stopMetro();getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);web.evaluateJavascript("window.dispatchEvent(new Event('nativePause'))",null);web.onPause();}
  @Override public void onResume(){super.onResume();printing=false;if(web!=null)web.onResume();}
  @Override public void onDestroy(){if(siteDialog!=null)siteDialog.dismiss();studio.onPause();destroyed=true;stopSpeech();closeVideo(false);stopMetro();clock.shutdownNow();network.shutdownNow();if(tone!=null){tone.release();tone=null;}if(printWeb!=null)printWeb.destroy();web.removeJavascriptInterface("GocAndroid");web.destroy();super.onDestroy();}
}
