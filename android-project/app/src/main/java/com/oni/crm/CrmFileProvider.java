package com.oni.crm;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import java.io.File;
import java.io.FileNotFoundException;

/** Minimal private FileProvider for camera capture without AndroidX dependencies. */
public class CrmFileProvider extends ContentProvider {
    private File root;
    @Override public boolean onCreate() {
        root = new File(getContext().getCacheDir(), "images");
        if (!root.exists()) root.mkdirs();
        return true;
    }
    private File resolve(Uri uri) throws FileNotFoundException {
        String name = uri.getLastPathSegment();
        if (name == null || name.contains("..") || name.contains("/")) throw new FileNotFoundException();
        File f = new File(root, name);
        try {
            if (!f.getCanonicalPath().startsWith(root.getCanonicalPath() + File.separator)) throw new FileNotFoundException();
        } catch (java.io.IOException e) { throw new FileNotFoundException(); }
        return f;
    }
    @Override public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        return ParcelFileDescriptor.open(resolve(uri), ParcelFileDescriptor.MODE_READ_WRITE);
    }
    @Override public String getType(Uri uri) {
        String n = uri == null ? "" : String.valueOf(uri.getLastPathSegment()).toLowerCase(java.util.Locale.ROOT);
        return n.endsWith(".mp4") || n.endsWith(".3gp") || n.endsWith(".mkv") ? "video/mp4" : "image/jpeg";
    }
    @Override public int delete(Uri uri, String selection, String[] args) { File f; try { f=resolve(uri); } catch(Exception e){ return 0; } return f.delete()?1:0; }
    @Override public Cursor query(Uri uri, String[] projection, String selection, String[] selectionArgs, String sortOrder) {
        File f; try { f=resolve(uri); } catch(Exception e){ return null; }
        String[] cols = projection != null ? projection : new String[]{"_display_name","_size"};
        MatrixCursor c = new MatrixCursor(cols);
        Object[] row = new Object[cols.length];
        for(int i=0;i<cols.length;i++) row[i] = "_display_name".equals(cols[i]) ? f.getName() : ("_size".equals(cols[i]) ? f.length() : null);
        c.addRow(row); return c;
    }
    @Override public int update(Uri uri, ContentValues values, String selection, String[] selectionArgs) { return 0; }
    @Override public Uri insert(Uri uri, ContentValues values) { return null; }
}
