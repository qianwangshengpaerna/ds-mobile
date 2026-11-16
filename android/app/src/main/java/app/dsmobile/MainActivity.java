package app.dsmobile;

import android.Manifest;
import android.app.Activity;
import android.content.*;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.*;
import android.security.keystore.*;
import android.util.Base64;
import android.webkit.*;
import java.io.*;
import java.net.*;
import java.security.KeyStore;
import java.util.*;
import java.util.concurrent.*;
import javax.crypto.*;
import javax.crypto.spec.GCMParameterSpec;
import org.json.*;

public class MainActivity extends Activity {
  private static final String ORIGIN = "https://ds.mobile.local";
  private WebView web;
  private final ExecutorService pool = Executors.newFixedThreadPool(4);
  private final ConcurrentHashMap<String, HttpURLConnection> connections =
      new ConcurrentHashMap<>();
  private final Set<String> cancelled = ConcurrentHashMap.newKeySet();
  private ValueCallback<Uri[]> fileCallback;
  private PermissionRequest audioRequest;
  private LocalFileExports fileExports;
  private android.content.SharedPreferences prefs;

  @Override
  public void onCreate(Bundle state) {
    super.onCreate(state);
    prefs = getSharedPreferences("ds-vault", MODE_PRIVATE);
    fileExports =
        new LocalFileExports(
            this,
            prefs,
            pool,
            (id, result) ->
                runOnUiThread(
                    () -> {
                      if (web != null)
                        web.evaluateJavascript(
                            "window.__dsFileEvent&&window.__dsFileEvent("
                                + JSONObject.quote(id)
                                + ","
                                + result.toString()
                                + ")",
                            null);
                    }));
    web = new WebView(this);
    web.setBackgroundColor(Color.WHITE);
    if (Build.VERSION.SDK_INT >= 30) {
      getWindow().setDecorFitsSystemWindows(false);
    }
    SafeAreaLayout content = new SafeAreaLayout(this);
    content.setBackgroundColor(Color.WHITE);
    content.addView(
        web,
        new android.widget.FrameLayout.LayoutParams(
            android.view.ViewGroup.LayoutParams.MATCH_PARENT,
            android.view.ViewGroup.LayoutParams.MATCH_PARENT));
    setContentView(content);
    WebSettings settings = web.getSettings();
    settings.setJavaScriptEnabled(true);
    settings.setDomStorageEnabled(true);
    settings.setAllowFileAccess(false);
    settings.setAllowContentAccess(true);
    settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
    settings.setMediaPlaybackRequiresUserGesture(false);
    settings.setSupportMultipleWindows(false);
    android.webkit.CookieManager.getInstance().setAcceptThirdPartyCookies(web, false);
    web.addJavascriptInterface(new Bridge(), "DSNative");
    web.setWebViewClient(
        new WebViewClient() {
          @Override
          public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) {
            if (!ORIGIN.equals(req.getUrl().getScheme() + "://" + req.getUrl().getAuthority()))
              return null;
            try {
              String path = req.getUrl().getPath();
              if (path == null || path.equals("/")) path = "/index.html";
              if (path.contains("..")) throw new IOException();
              String mime =
                  path.endsWith(".js")
                      ? "application/javascript"
                      : path.endsWith(".css")
                          ? "text/css"
                          : path.endsWith(".html")
                              ? "text/html"
                              : path.endsWith(".woff2")
                                  ? "font/woff2"
                                  : path.endsWith(".ttf") ? "font/ttf" : "application/octet-stream";
              WebResourceResponse response =
                  new WebResourceResponse(mime, "UTF-8", getAssets().open("web" + path));
              Map<String, String> h = new HashMap<>();
              h.put(
                  "Content-Security-Policy",
                  "default-src 'self'; script-src 'self' 'unsafe-eval'; style-src 'self'"
                      + " 'unsafe-inline'; img-src 'self' data: blob: https:; media-src 'self'"
                      + " blob:; font-src 'self' data:; connect-src 'self' blob: https:; worker-src"
                      + " 'self' blob:; object-src 'none'; base-uri 'self'");
              response.setResponseHeaders(h);
              return response;
            } catch (IOException e) {
              return new WebResourceResponse(
                  "text/plain",
                  "UTF-8",
                  404,
                  "Not Found",
                  Collections.emptyMap(),
                  new ByteArrayInputStream(new byte[0]));
            }
          }

          @Override
          public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
            if (req.getUrl().toString().startsWith(ORIGIN + "/")) return false;
            if ("https".equals(req.getUrl().getScheme()) || "http".equals(req.getUrl().getScheme()))
              try {
                startActivity(new Intent(Intent.ACTION_VIEW, req.getUrl()));
              } catch (Exception ignored) {
              }
            return true;
          }
        });
    web.setWebChromeClient(
        new WebChromeClient() {
          @Override
          public boolean onJsAlert(WebView view, String url, String message, JsResult result) {
            new android.app.AlertDialog.Builder(MainActivity.this)
                .setMessage(message)
                .setPositiveButton("确定", (d, w) -> result.confirm())
                .setOnCancelListener(d -> result.cancel())
                .show();
            return true;
          }

          @Override
          public boolean onShowFileChooser(
              WebView w, ValueCallback<Uri[]> cb, FileChooserParams params) {
            if (fileCallback != null) fileCallback.onReceiveValue(null);
            fileCallback = cb;
            Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
            intent.setType("*/*");
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.putExtra(
                Intent.EXTRA_ALLOW_MULTIPLE,
                params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE);
            try {
              startActivityForResult(intent, 41);
            } catch (Exception e) {
              cb.onReceiveValue(null);
              fileCallback = null;
            }
            return true;
          }

          @Override
          public void onPermissionRequest(PermissionRequest request) {
            runOnUiThread(
                () -> {
                  if (!ORIGIN.equals(request.getOrigin().toString().replaceAll("/$", ""))
                      || !Arrays.asList(request.getResources())
                          .contains(PermissionRequest.RESOURCE_AUDIO_CAPTURE)) {
                    request.deny();
                    return;
                  }
                  if (checkSelfPermission(Manifest.permission.RECORD_AUDIO)
                      == PackageManager.PERMISSION_GRANTED)
                    request.grant(new String[] {PermissionRequest.RESOURCE_AUDIO_CAPTURE});
                  else {
                    if (audioRequest != null) audioRequest.deny();
                    audioRequest = request;
                    requestPermissions(new String[] {Manifest.permission.RECORD_AUDIO}, 42);
                  }
                });
          }

          @Override
          public void onPermissionRequestCanceled(PermissionRequest request) {
            if (audioRequest == request) audioRequest = null;
          }
        });
    web.loadUrl(ORIGIN + "/index.html");
  }

  private void emit(String id, String event, Object value) {
    runOnUiThread(
        () -> {
          if (web != null)
            web.evaluateJavascript(
                "window.__dsNetwork&&window.__dsNetwork("
                    + JSONObject.quote(id)
                    + ","
                    + JSONObject.quote(event)
                    + ","
                    + (value instanceof JSONObject
                        ? value.toString()
                        : JSONObject.quote(String.valueOf(value)))
                    + ")",
                null);
        });
  }

  private boolean allowed(URL url) {
    String host = url.getHost().toLowerCase(Locale.ROOT);
    String authority = host + (url.getPort() != -1 ? ":" + url.getPort() : "");
    return url.getProtocol().equals("https")
        && url.getUserInfo() == null
        && (host.equals("api.deepseek.com") && url.getPort() == -1
            || host.equals("generativelanguage.googleapis.com") && url.getPort() == -1
            || prefs.getStringSet("allowed", Collections.emptySet()).contains(authority));
  }

  private javax.crypto.SecretKey key() throws Exception {
    KeyStore ks = KeyStore.getInstance("AndroidKeyStore");
    ks.load(null);
    if (!ks.containsAlias("ds-mobile-v1")) {
      KeyGenerator kg =
          KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
      kg.init(
          new KeyGenParameterSpec.Builder(
                  "ds-mobile-v1", KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
              .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
              .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
              .build());
      kg.generateKey();
    }
    return (javax.crypto.SecretKey) ks.getKey("ds-mobile-v1", null);
  }

  private class Bridge {
    @JavascriptInterface
    public synchronized String getSecret(String name) {
      if (!name.equals("chat-demo:api-key") && !name.equals("ds-mobile:config")) return null;
      String stored = prefs.getString("secret:" + name, null);
      if (stored == null) return null;
      try {
        String[] parts = stored.split(":");
        Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
        c.init(
            Cipher.DECRYPT_MODE,
            key(),
            new GCMParameterSpec(128, Base64.decode(parts[0], Base64.NO_WRAP)));
        return new String(
            c.doFinal(Base64.decode(parts[1], Base64.NO_WRAP)),
            java.nio.charset.StandardCharsets.UTF_8);
      } catch (Exception e) {
        return null;
      }
    }

    @JavascriptInterface
    public synchronized void setSecret(String name, String value) {
      if (!name.equals("chat-demo:api-key") && !name.equals("ds-mobile:config")) return;
      try {
        Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
        c.init(Cipher.ENCRYPT_MODE, key());
        String data =
            Base64.encodeToString(c.getIV(), Base64.NO_WRAP)
                + ":"
                + Base64.encodeToString(
                    c.doFinal(value.getBytes(java.nio.charset.StandardCharsets.UTF_8)),
                    Base64.NO_WRAP);
        if (!prefs.edit().putString("secret:" + name, data).commit()) throw new IOException();
      } catch (Exception e) {
        runOnUiThread(
            () ->
                new android.app.AlertDialog.Builder(MainActivity.this)
                    .setMessage("本机密钥保存失败，请重试。")
                    .setPositiveButton("确定", null)
                    .show());
      }
    }

    @JavascriptInterface
    public void removeSecret(String name) {
      prefs.edit().remove("secret:" + name).commit();
    }

    @JavascriptInterface
    public void allowHost(String host) {
      try {
        URL u = new URL("https://" + host);
        if (!host.equals(u.getAuthority()) || u.getUserInfo() != null) return;
        Set<String> hosts = new HashSet<>(prefs.getStringSet("allowed", Collections.emptySet()));
        hosts.add(host.toLowerCase(Locale.ROOT));
        prefs.edit().putStringSet("allowed", hosts).commit();
      } catch (Exception ignored) {
      }
    }

    @JavascriptInterface
    public void cancel(String id) {
      cancelled.add(id);
      HttpURLConnection c = connections.remove(id);
      if (c != null) pool.execute(c::disconnect);
    }

    @JavascriptInterface
    public void request(String id, String json) {
      pool.execute(
          () -> {
            HttpURLConnection c = null;
            try {
              if (cancelled.contains(id)) return;
              JSONObject req = new JSONObject(json);
              URL url = new URL(req.getString("url"));
              if (!allowed(url)) throw new IOException("请先在插件中心添加并授权此 HTTPS 服务。");
              c = (HttpURLConnection) url.openConnection();
              connections.put(id, c);
              if (cancelled.contains(id)) return;
              c.setInstanceFollowRedirects(false);
              c.setConnectTimeout(20000);
              c.setReadTimeout(180000);
              c.setRequestMethod(req.getString("method"));
              JSONObject headers = req.getJSONObject("headers");
              Iterator<String> iter = headers.keys();
              while (iter.hasNext()) {
                String h = iter.next();
                if (!h.equalsIgnoreCase("host")
                    && !h.equalsIgnoreCase("cookie")
                    && !h.equalsIgnoreCase("content-length"))
                  c.setRequestProperty(h, headers.getString(h));
              }
              if (!req.isNull("body")) {
                byte[] bytes = Base64.decode(req.getString("body"), Base64.NO_WRAP);
                c.setDoOutput(true);
                c.setFixedLengthStreamingMode(bytes.length);
                try (OutputStream out = c.getOutputStream()) {
                  out.write(bytes);
                }
              }
              int status = c.getResponseCode();
              JSONObject rh = new JSONObject();
              for (Map.Entry<String, List<String>> h : c.getHeaderFields().entrySet())
                if (h.getKey() != null) rh.put(h.getKey(), String.join(", ", h.getValue()));
              emit(id, "headers", new JSONObject().put("status", status).put("headers", rh));
              InputStream raw = status >= 400 ? c.getErrorStream() : c.getInputStream();
              if (raw != null)
                try (InputStream in = raw) {
                  byte[] buffer = new byte[8192];
                  int count;
                  while (!cancelled.contains(id) && (count = in.read(buffer)) != -1)
                    emit(id, "chunk", Base64.encodeToString(buffer, 0, count, Base64.NO_WRAP));
                }
              if (!cancelled.contains(id)) emit(id, "end", "");
            } catch (Exception e) {
              if (!cancelled.contains(id))
                emit(
                    id,
                    "error",
                    e instanceof SocketTimeoutException
                        ? "连接超时，请检查网络后重试。"
                        : e.getMessage() == null ? "网络连接失败" : e.getMessage());
            } finally {
              if (c != null) c.disconnect();
              connections.remove(id);
              cancelled.remove(id);
            }
          });
    }

    @JavascriptInterface
    public void saveFile(String name, String data) {
      fileExports.save("", name, "application/zip", data);
    }

    @JavascriptInterface
    public void exportFile(String id, String name, String mime, String data) {
      fileExports.save(id, name, mime, data);
    }

    @JavascriptInterface
    public String getExportDirectory() {
      return fileExports.directory();
    }

    @JavascriptInterface
    public void chooseExportDirectory(String id) {
      fileExports.choose(id);
    }

    @JavascriptInterface
    public void resetExportDirectory() {
      fileExports.reset();
    }
  }

  @Override
  public void onRequestPermissionsResult(int code, String[] permissions, int[] results) {
    super.onRequestPermissionsResult(code, permissions, results);
    if (code == 42 && audioRequest != null) {
      if (results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED)
        audioRequest.grant(new String[] {PermissionRequest.RESOURCE_AUDIO_CAPTURE});
      else audioRequest.deny();
      audioRequest = null;
    }
  }

  @Override
  protected void onActivityResult(int code, int result, Intent data) {
    super.onActivityResult(code, result, data);
    if (code == 41 && fileCallback != null) {
      List<Uri> uris = new ArrayList<>();
      if (result == RESULT_OK && data != null) {
        if (data.getClipData() != null) {
          for (int i = 0; i < data.getClipData().getItemCount(); i++)
            uris.add(data.getClipData().getItemAt(i).getUri());
        } else if (data.getData() != null) uris.add(data.getData());
      }
      fileCallback.onReceiveValue(uris.isEmpty() ? null : uris.toArray(new Uri[0]));
      fileCallback = null;
    }
    fileExports.onActivityResult(code, result, data);
  }

  @Override
  public void onBackPressed() {
    web.evaluateJavascript(
        "(()=>{if(document.querySelector('[role=dialog]')){document.dispatchEvent(new"
            + " KeyboardEvent('keydown',{key:'Escape',bubbles:true}));return true}return false})()",
        value -> {
          if (!"true".equals(value))
            new android.app.AlertDialog.Builder(this)
                .setMessage("退出 ds mobile？聊天记录已自动保存。")
                .setNegativeButton("取消", null)
                .setPositiveButton("退出", (d, w) -> finish())
                .show();
        });
  }

  @Override
  protected void onPause() {
    super.onPause();
    web.evaluateJavascript("window.dispatchEvent(new Event('pagehide'))", null);
  }

  @Override
  protected void onDestroy() {
    for (HttpURLConnection c : connections.values()) c.disconnect();
    pool.shutdownNow();
    if (fileCallback != null) fileCallback.onReceiveValue(null);
    if (audioRequest != null) audioRequest.deny();
    web.removeJavascriptInterface("DSNative");
    web.destroy();
    web = null;
    super.onDestroy();
  }
}
