package app.dsmobile;

import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.net.Uri;
import android.provider.DocumentsContract;
import android.util.Base64;
import android.widget.Toast;
import java.io.IOException;
import java.io.OutputStream;
import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import org.json.JSONObject;

/** Storage Access Framework exports: durable folder grants and MIME-aware Save As fallback. */
final class LocalFileExports {
  static final int SAVE_FILE = 43;
  static final int CHOOSE_FOLDER = 44;

  interface Events {
    void send(String id, JSONObject result);
  }

  private final Activity activity;
  private final SharedPreferences prefs;
  private final ExecutorService pool;
  private final Events events;
  private Pending pending;
  private String folderRequest;

  private static final class Pending {
    final String id, name, mime;
    final byte[] bytes;

    Pending(String id, String name, String mime, byte[] bytes) {
      this.id = id;
      this.name = name;
      this.mime = mime;
      this.bytes = bytes;
    }
  }

  LocalFileExports(
      Activity activity, SharedPreferences prefs, ExecutorService pool, Events events) {
    this.activity = activity;
    this.prefs = prefs;
    this.pool = pool;
    this.events = events;
  }

  private JSONObject result(boolean ok, String message, Uri uri, boolean cancelled) {
    JSONObject out = new JSONObject();
    try {
      out.put("ok", ok);
      out.put("message", message);
      out.put("label", message);
      out.put("cancelled", cancelled);
      if (uri != null) out.put("uri", uri.toString());
    } catch (Exception ignored) {
    }
    return out;
  }

  String directory() {
    String tree = prefs.getString("export-tree", null);
    boolean granted =
        tree != null
            && activity.getContentResolver().getPersistedUriPermissions().stream()
                .anyMatch(p -> p.getUri().toString().equals(tree) && p.isWritePermission());
    JSONObject out = new JSONObject();
    try {
      out.put("mode", granted ? "folder" : "ask");
      out.put("label", granted ? prefs.getString("export-label", "所选文件夹") : "每次选择保存位置");
    } catch (Exception ignored) {
    }
    return out.toString();
  }

  void reset() {
    String tree = prefs.getString("export-tree", null);
    prefs.edit().remove("export-tree").remove("export-label").commit();
    if (tree != null) {
      try {
        activity
            .getContentResolver()
            .releasePersistableUriPermission(
                Uri.parse(tree),
                Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
      } catch (Exception ignored) {
      }
    }
  }

  void choose(String id) {
    activity.runOnUiThread(
        () -> {
          if (folderRequest != null || pending != null) {
            events.send(id, result(false, "请先完成当前文件操作", null, false));
            return;
          }
          folderRequest = id;
          Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
          intent.addFlags(
              Intent.FLAG_GRANT_READ_URI_PERMISSION
                  | Intent.FLAG_GRANT_WRITE_URI_PERMISSION
                  | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION
                  | Intent.FLAG_GRANT_PREFIX_URI_PERMISSION);
          String previous = prefs.getString("export-tree", null);
          if (previous != null)
            intent.putExtra(DocumentsContract.EXTRA_INITIAL_URI, Uri.parse(previous));
          try {
            activity.startActivityForResult(intent, CHOOSE_FOLDER);
          } catch (Exception e) {
            folderRequest = null;
            events.send(id, result(false, "无法打开文件夹选择器", null, false));
          }
        });
  }

  static String cleanName(String name) {
    String cleaned =
        name.replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", "_").replaceAll("^\\.+", "").trim();
    if (cleaned.isEmpty()) cleaned = "ds-mobile-export";
    if (cleaned.length() > 140) {
      int dot = cleaned.lastIndexOf('.');
      String extension = dot > 0 && cleaned.length() - dot < 15 ? cleaned.substring(dot) : "";
      cleaned = cleaned.substring(0, 120) + extension;
    }
    return cleaned;
  }

  void save(String id, String name, String mime, String encoded) {
    if (encoded.length() > 60 * 1024 * 1024) {
      events.send(id, result(false, "文件过大，请缩小文档范围后重试", null, false));
      return;
    }
    pool.execute(
        () -> {
          try {
            byte[] bytes = Base64.decode(encoded, Base64.NO_WRAP);
            String type =
                mime.matches("[a-zA-Z0-9!#$&^_.+\\-]+/[a-zA-Z0-9!#$&^_.+\\-]+")
                    ? mime
                    : "application/octet-stream";
            Pending task = new Pending(id, cleanName(name), type, bytes);
            activity.runOnUiThread(
                () -> {
                  if (pending != null || folderRequest != null) {
                    events.send(id, result(false, "请先完成当前文件操作", null, false));
                    return;
                  }
                  pending = task;
                  String tree = prefs.getString("export-tree", null);
                  if (tree == null) showPicker(task);
                  else pool.execute(() -> saveToFolder(task, Uri.parse(tree)));
                });
          } catch (Exception e) {
            events.send(id, result(false, "文件内容无法读取，请重新生成", null, false));
          }
        });
  }

  private void showPicker(Pending task) {
    Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
    intent.addCategory(Intent.CATEGORY_OPENABLE);
    intent.setType(task.mime);
    intent.putExtra(Intent.EXTRA_TITLE, task.name);
    try {
      activity.startActivityForResult(intent, SAVE_FILE);
    } catch (Exception e) {
      pending = null;
      events.send(task.id, result(false, "无法打开保存文件选择器", null, false));
    }
  }

  private String uniqueName(Uri tree, String name) throws Exception {
    Uri children =
        DocumentsContract.buildChildDocumentsUriUsingTree(
            tree, DocumentsContract.getTreeDocumentId(tree));
    Set<String> existing = new HashSet<>();
    try (Cursor c =
        activity
            .getContentResolver()
            .query(
                children,
                new String[] {DocumentsContract.Document.COLUMN_DISPLAY_NAME},
                null,
                null,
                null)) {
      if (c != null) {
        while (c.moveToNext()) {
          existing.add(c.getString(0));
          if (existing.size() > 10000) throw new IOException("文件夹内容过多");
        }
      }
    }
    if (!existing.contains(name)) return name;
    int dot = name.lastIndexOf('.');
    String stem = dot > 0 ? name.substring(0, dot) : name;
    String ext = dot > 0 ? name.substring(dot) : "";
    for (int i = 1; i < 10000; i++) {
      String candidate = stem + " (" + i + ")" + ext;
      if (!existing.contains(candidate)) return candidate;
    }
    throw new IOException("同名文件过多");
  }

  private void saveToFolder(Pending task, Uri tree) {
    Uri created = null;
    try {
      Uri parent =
          DocumentsContract.buildDocumentUriUsingTree(
              tree, DocumentsContract.getTreeDocumentId(tree));
      String name = uniqueName(tree, task.name);
      created =
          DocumentsContract.createDocument(activity.getContentResolver(), parent, task.mime, name);
      if (created == null) throw new IOException("无法创建文件");
      write(task, created);
      Uri saved = created;
      activity.runOnUiThread(() -> complete(task, saved, name));
    } catch (Exception e) {
      if (created != null)
        try {
          DocumentsContract.deleteDocument(activity.getContentResolver(), created);
        } catch (Exception ignored) {
        }
      activity.runOnUiThread(
          () -> {
            Toast.makeText(activity, "默认文件夹不可写，请另选保存位置", Toast.LENGTH_LONG).show();
            showPicker(task);
          });
    }
  }

  private void write(Pending task, Uri uri) throws IOException {
    try (OutputStream output = activity.getContentResolver().openOutputStream(uri, "wt")) {
      if (output == null) throw new IOException("无法打开目标文件");
      output.write(task.bytes);
    }
  }

  private void complete(Pending task, Uri uri, String label) {
    pending = null;
    Toast.makeText(activity, "文件已保存：" + label, Toast.LENGTH_SHORT).show();
    events.send(task.id, result(true, label, uri, false));
  }

  void onActivityResult(int request, int code, Intent data) {
    if (request == CHOOSE_FOLDER && folderRequest != null) {
      String id = folderRequest;
      folderRequest = null;
      if (code != Activity.RESULT_OK || data == null || data.getData() == null) {
        events.send(id, result(true, "已取消选择", null, true));
        return;
      }
      Uri tree = data.getData();
      try {
        int flags =
            data.getFlags()
                & (Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
        if ((flags & Intent.FLAG_GRANT_WRITE_URI_PERMISSION) == 0)
          throw new IOException("文件夹未授予写入权限");
        activity.getContentResolver().takePersistableUriPermission(tree, flags);
        Uri document =
            DocumentsContract.buildDocumentUriUsingTree(
                tree, DocumentsContract.getTreeDocumentId(tree));
        String label = tree.getLastPathSegment();
        try (Cursor c =
            activity
                .getContentResolver()
                .query(
                    document,
                    new String[] {DocumentsContract.Document.COLUMN_DISPLAY_NAME},
                    null,
                    null,
                    null)) {
          if (c != null && c.moveToFirst()) label = c.getString(0);
        }
        String previous = prefs.getString("export-tree", null);
        prefs
            .edit()
            .putString("export-tree", tree.toString())
            .putString("export-label", label)
            .commit();
        if (previous != null && !previous.equals(tree.toString()))
          try {
            activity
                .getContentResolver()
                .releasePersistableUriPermission(
                    Uri.parse(previous),
                    Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
          } catch (Exception ignored) {
          }
        events.send(id, result(true, label, tree, false));
      } catch (Exception e) {
        events.send(id, result(false, "此位置不能作为导出目录，请选择其他文件夹", null, false));
      }
    }
    if (request == SAVE_FILE && pending != null) {
      Pending task = pending;
      if (code != Activity.RESULT_OK || data == null || data.getData() == null) {
        pending = null;
        events.send(task.id, result(true, "已取消保存", null, true));
        return;
      }
      Uri uri = data.getData();
      pool.execute(
          () -> {
            try {
              write(task, uri);
              activity.runOnUiThread(() -> complete(task, uri, task.name));
            } catch (Exception e) {
              try {
                DocumentsContract.deleteDocument(activity.getContentResolver(), uri);
              } catch (Exception ignored) {
              }
              activity.runOnUiThread(
                  () -> {
                    pending = null;
                    events.send(task.id, result(false, "保存失败，请检查剩余空间或重新选择位置", null, false));
                  });
            }
          });
    }
  }
}
