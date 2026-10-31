import { Icon, SocialIcon, type SocialMark } from "@skmate/ui";
import { t, type Key } from "../i18n";

const HANDLE = "swensi17";
const CHAT = "skmatetv";

interface Link { mark: SocialMark; name: string; what: Key; address: string }
const LINKS: Link[] = [
  { mark: "telegram", name: `@${CHAT}`, what: "aboutChat", address: `t.me/${CHAT}` },
  { mark: "telegram", name: "Telegram", what: "aboutTelegram", address: `t.me/${HANDLE}` },
  { mark: "github", name: "GitHub", what: "aboutCode", address: `github.com/${HANDLE}/skmate-iptv` },
  { mark: "x", name: "X", what: "aboutX", address: `x.com/${HANDLE}` },
];

/** The About page of the phone version: thanks with a red heart, the links (OK shows a QR code), the licence. */
export function AboutPanel({ onQr }: { onQr: (name: string, address: string) => void }) {
  return (
    <>
      <div class="thanks">
        <span class="thanks-title">{t("aboutThanksTitle")}</span>
        <span class="heart"><Icon name="favorite" size={36} /></span>
      </div>
      <div class="thanks-body">{t("aboutThanksBody")}</div>
      {LINKS.map((l) => (
        <button class="link-row" key={l.address} data-focus={`about-${l.address}`} onClick={() => onQr(l.name, l.address)}>
          <SocialIcon mark={l.mark} />
          <span class="link-text">
            <span class="link-name">{l.name}</span>
            <span class="link-what">{t(l.what)}</span>
            <span class="link-addr">{l.address}</span>
          </span>
        </button>
      ))}
      <div class="about-license">{t("aboutLicense")}</div>
      <div class="about-note">{t("aboutDisclaimer")}</div>
    </>
  );
}
