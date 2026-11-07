package vn.gochopam.app;
import android.content.*;
import android.database.*;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;
import java.io.*;

/** Read-only, per-file URI grants for the system share sheet. */
public final class RecordingProvider extends ContentProvider {
  @Override public boolean onCreate(){return true;}
  private File file(Uri uri)throws FileNotFoundException{String name=uri.getLastPathSegment();if(name==null||!name.matches("GocHopAm-[A-Za-z0-9.-]+\\.(mp4|m4a|webm)"))throw new FileNotFoundException();File f=new File(StudioService.directory(getContext()),name);if(!f.isFile())throw new FileNotFoundException();return f;}
  @Override public String getType(Uri uri){String name=uri.getLastPathSegment();return name!=null&&name.endsWith(".m4a")?"audio/mp4":name!=null&&name.endsWith(".webm")?"video/webm":"video/mp4";}
  @Override public ParcelFileDescriptor openFile(Uri uri,String mode)throws FileNotFoundException{if(!"r".equals(mode))throw new FileNotFoundException("Read only");return ParcelFileDescriptor.open(file(uri),ParcelFileDescriptor.MODE_READ_ONLY);}
  @Override public Cursor query(Uri uri,String[] projection,String selection,String[] args,String order){try{File f=file(uri);MatrixCursor cursor=new MatrixCursor(new String[]{OpenableColumns.DISPLAY_NAME,OpenableColumns.SIZE});cursor.addRow(new Object[]{f.getName(),f.length()});return cursor;}catch(Exception e){return null;}}
  @Override public Uri insert(Uri u,ContentValues v){throw new UnsupportedOperationException();}
  @Override public int update(Uri u,ContentValues v,String s,String[] a){throw new UnsupportedOperationException();}
  @Override public int delete(Uri u,String s,String[] a){throw new UnsupportedOperationException();}
}
