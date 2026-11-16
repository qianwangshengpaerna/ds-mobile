package app.dsmobile;

import android.content.Context;
import android.graphics.Insets;
import android.os.Build;
import android.view.WindowInsets;
import android.view.WindowInsetsAnimation;
import android.widget.FrameLayout;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/** Owns safe-area and IME resizing outside WebView, including during keyboard animation. */
final class SafeAreaLayout extends FrameLayout {
  SafeAreaLayout(Context context) {
    super(context);
    if (Build.VERSION.SDK_INT < 30) {
      // The legacy decor + adjustResize handles the IME. Pad the parent, never WebView itself.
      setFitsSystemWindows(true);
      return;
    }

    Set<WindowInsetsAnimation> keyboardAnimations = new HashSet<>();
    setOnApplyWindowInsetsListener(
        (view, insets) -> {
          // Android dispatches the final insets before starting the animation. Wait for
          // onProgress in that case so the composer doesn't jump ahead of the keyboard.
          if (keyboardAnimations.isEmpty()) {
            applyInsets(insets);
          }
          return handledInsets(insets);
        });
    setWindowInsetsAnimationCallback(
        new WindowInsetsAnimation.Callback(
            WindowInsetsAnimation.Callback.DISPATCH_MODE_CONTINUE_ON_SUBTREE) {
          @Override
          public void onPrepare(WindowInsetsAnimation animation) {
            if ((animation.getTypeMask() & WindowInsets.Type.ime()) != 0) {
              keyboardAnimations.add(animation);
            }
          }

          @Override
          public WindowInsets onProgress(
              WindowInsets insets, List<WindowInsetsAnimation> runningAnimations) {
            applyInsets(insets);
            return handledInsets(insets);
          }

          @Override
          public void onEnd(WindowInsetsAnimation animation) {
            keyboardAnimations.remove(animation);
            if (keyboardAnimations.isEmpty()) {
              // Also settle interrupted / reversed animations and gesture keyboard dismissal.
              requestApplyInsets();
            }
          }
        });
  }

  @Override
  protected void onAttachedToWindow() {
    super.onAttachedToWindow();
    requestApplyInsets();
  }

  private void applyInsets(WindowInsets insets) {
    Insets safe =
        insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
    int bottom = Math.max(safe.bottom, insets.getInsets(WindowInsets.Type.ime()).bottom);
    if (getPaddingLeft() != safe.left
        || getPaddingTop() != safe.top
        || getPaddingRight() != safe.right
        || getPaddingBottom() != bottom) {
      setPadding(safe.left, safe.top, safe.right, bottom);
    }
  }

  private WindowInsets handledInsets(WindowInsets insets) {
    int safe = WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout();
    // The child WebView is already physically inside the usable rectangle. Forward
    // explicit zeroes (including when IME closes) to prevent double / ghost padding
    // and WebView-version-dependent visual viewport shrinking.
    return new WindowInsets.Builder(insets)
        .setInsets(safe | WindowInsets.Type.ime(), Insets.NONE)
        .setInsetsIgnoringVisibility(safe, Insets.NONE)
        .setDisplayCutout(null)
        .build();
  }
}
