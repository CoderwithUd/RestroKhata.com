import Navigation from "@/components/Navigation/Navigation";
import Footer from "@/components/Footer/Footer";
import styles from "./Download.module.css";
import { Download, Monitor, Smartphone, Terminal, Apple } from "lucide-react";
import type { Metadata } from "next";
import { siteTitle } from "@/lib/seo";

export const metadata: Metadata = {
  title: `Download - ${siteTitle}`,
  description: "Download the latest version of RestroKhata for Windows, Mac, Linux, Android, and iOS.",
};

// Revalidate the API call every hour (3600 seconds)
export const revalidate = 3600;

async function getLatestRelease() {
  try {
    const res = await fetch("https://api.github.com/repos/CoderwithUd/RestroKhata-Releases/releases/latest", {
      next: { revalidate: 3600 }
    });
    if (!res.ok) {
      return null;
    }
    return res.json();
  } catch {
    return null;
  }
}

export default async function DownloadPage() {
  const release = await getLatestRelease();
  
  let windowsUrl = "https://github.com/CoderwithUd/RestroKhata-Releases/releases/latest";
  let macUrl = "https://github.com/CoderwithUd/RestroKhata-Releases/releases/latest";
  let linuxUrl = "https://github.com/CoderwithUd/RestroKhata-Releases/releases/latest";
  let androidUrl = "https://github.com/CoderwithUd/RestroKhata-Releases/releases/latest";
  let version = "Latest";

  if (release && release.assets) {
    version = release.tag_name;
    type Asset = { name: string; browser_download_url: string };
    const exeAsset = release.assets.find((a: Asset) => a.name.endsWith(".exe"));
    const dmgAsset = release.assets.find((a: Asset) => a.name.endsWith(".dmg"));
    const appImageAsset = release.assets.find((a: Asset) => a.name.endsWith(".AppImage") || a.name.endsWith(".deb"));
    const apkAsset = release.assets.find((a: Asset) => a.name.endsWith(".apk"));
    
    if (exeAsset) windowsUrl = exeAsset.browser_download_url;
    if (dmgAsset) macUrl = dmgAsset.browser_download_url;
    if (appImageAsset) linuxUrl = appImageAsset.browser_download_url;
    if (apkAsset) androidUrl = apkAsset.browser_download_url;
  }

  return (
    <>
      <Navigation />
      <main className={styles.main}>
        <section className={styles.hero}>
          <div className={styles.container}>
            <div className={styles.header}>
              <h1 className={styles.title}>Download RestroKhata</h1>
              <p className={styles.subtitle}>Get the latest version ({version}) for your device. Available for all major platforms.</p>
            </div>
            
            <div className={styles.cards}>
              {/* Windows */}
              <div className={styles.card}>
                <div className={styles.iconWrapper}>
                  <Monitor size={48} className={styles.icon} />
                </div>
                <h2 className={styles.cardTitle}>Windows</h2>
                <p className={styles.cardDescription}>Optimized for Windows 10 & 11. Full-featured POS experience.</p>
                <a href={windowsUrl} className={`btn-primary ${styles.downloadBtn}`} target="_blank" rel="noopener noreferrer">
                  <Download size={20} />
                  Download .exe
                </a>
              </div>

              {/* Mac */}
              <div className={styles.card}>
                <div className={styles.iconWrapper}>
                  <Apple size={48} className={styles.icon} />
                </div>
                <h2 className={styles.cardTitle}>MacOS</h2>
                <p className={styles.cardDescription}>Seamless experience for Apple Silicon and Intel Macs.</p>
                <a href={macUrl} className={`btn-primary ${styles.downloadBtn}`} target="_blank" rel="noopener noreferrer">
                  <Download size={20} />
                  Download .dmg
                </a>
              </div>

              {/* Linux */}
              <div className={styles.card}>
                <div className={styles.iconWrapper}>
                  <Terminal size={48} className={styles.icon} />
                </div>
                <h2 className={styles.cardTitle}>Linux</h2>
                <p className={styles.cardDescription}>For Ubuntu, Debian, Fedora and other major distributions.</p>
                <a href={linuxUrl} className={`btn-primary ${styles.downloadBtn}`} target="_blank" rel="noopener noreferrer">
                  <Download size={20} />
                  Download .AppImage
                </a>
              </div>

              {/* Android */}
              <div className={styles.card}>
                <div className={styles.iconWrapper}>
                  <Smartphone size={48} className={styles.icon} />
                </div>
                <h2 className={styles.cardTitle}>Android</h2>
                <p className={styles.cardDescription}>Manage orders on the go. Perfect for waiters and staff.</p>
                <a href={androidUrl} className={`btn-primary ${styles.downloadBtn}`} target="_blank" rel="noopener noreferrer">
                  <Download size={20} />
                  Download APK
                </a>
              </div>

              {/* iOS */}
              <div className={styles.card}>
                <div className={styles.iconWrapper}>
                  <Smartphone size={48} className={styles.icon} />
                </div>
                <h2 className={styles.cardTitle}>iOS</h2>
                <p className={styles.cardDescription}>Access RestroKhata via the App Store for iPhone & iPad.</p>
                {/* Note: If there's an actual App Store link, you can put it here. Currently sending to the web app or generic URL */}
                <a href="https://app.restrokhata.com" className={`btn-primary ${styles.downloadBtn}`} target="_blank" rel="noopener noreferrer">
                  <Apple size={20} />
                  Open Web App
                </a>
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
