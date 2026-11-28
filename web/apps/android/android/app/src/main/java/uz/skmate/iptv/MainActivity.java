package uz.skmate.iptv;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import java.io.InputStream;
import java.security.KeyStore;
import java.security.cert.Certificate;
import java.security.cert.CertificateFactory;
import java.util.Enumeration;
import javax.net.ssl.HttpsURLConnection;
import javax.net.ssl.SSLContext;
import javax.net.ssl.TrustManagerFactory;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    trustLetsEncrypt();
    super.onCreate(savedInstanceState);
  }

  /**
   * Android 5.1 and older do not know the Let's Encrypt roots (ISRG Root X1 / X2), so every https server with such a
   * certificate fails with "Trust anchor for certification path not found". The two public roots are bundled and added
   * to the system ones for the app's native requests (playlists, guides, weather, update checks).
   */
  private void trustLetsEncrypt() {
    try {
      // The system store is read-only: its roots are copied into a store of our own, and the two ISRG roots added.
      KeyStore system = KeyStore.getInstance("AndroidCAStore");
      system.load(null, null);
      KeyStore store = KeyStore.getInstance(KeyStore.getDefaultType());
      store.load(null, null);
      Enumeration<String> aliases = system.aliases();
      while (aliases.hasMoreElements()) {
        String alias = aliases.nextElement();
        Certificate known = system.getCertificate(alias);
        if (known != null) store.setCertificateEntry(alias, known);
      }
      CertificateFactory factory = CertificateFactory.getInstance("X.509");
      int[] roots = {R.raw.isrg_root_x1, R.raw.isrg_root_x2};
      for (int i = 0; i < roots.length; i++) {
        try (InputStream in = getResources().openRawResource(roots[i])) {
          Certificate cert = factory.generateCertificate(in);
          store.setCertificateEntry("skmate-isrg-" + i, cert);
        }
      }
      TrustManagerFactory tmf = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm());
      tmf.init(store);
      SSLContext context = SSLContext.getInstance("TLS");
      context.init(null, tmf.getTrustManagers(), null);
      HttpsURLConnection.setDefaultSSLSocketFactory(context.getSocketFactory());
    } catch (Exception e) {
      // The system roots stay as they were: newer Android does not need this.
      android.util.Log.w("SkMate", "extra roots not installed", e);
    }
  }
}
