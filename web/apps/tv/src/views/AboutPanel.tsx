import { SocialIcon, type SocialMark } from "@skmate/ui";
import { t, type Key } from "../i18n";
import { InfoCard, SIcon } from "./SettingsKit";

const HANDLE = "swensi17";
const CHAT = "skmatetv";

interface Link { mark: SocialMark; name: string; what: Key; address: string }
const LINKS: Link[] = [
  { mark: "telegram", name: `@${CHAT}`, what: "sa_about_social_chat", address: `t.me/${CHAT}` },
  { mark: "telegram", name: "Telegram", what: "sa_about_social_telegram", address: `t.me/${HANDLE}` },
  { mark: "github", name: "GitHub", what: "sa_about_social_code", address: `github.com/${HANDLE}` },
  { mark: "x", name: "X", what: "sa_about_social_x", address: `x.com/${HANDLE}` },
];

/**
 * О приложении (MorePages.kt AboutPage): the thanks with an outlined red heart, the four link cards (no fill, the
 * focus plate only, a line before each; OK shows the address as a QR code), the line before the disclaimer.
 */
export function AboutPanel({ onQr }: { onQr: (name: string, address: string) => void }) {
  return (
    <div class="set-about">
      <div class="set-thanks">
        <span class="set-thanks-title">{t("sa_about_thanks_title")}</span>
        <span class="set-heart"><SIcon name="FAVORITE" size={32} /></span>
      </div>
      <div class="set-thanks-body">{t("sa_about_thanks_body")}</div>
      {LINKS.map((l) => (
        <div key={l.address}>
          <div class="set-divider inset24" />
          <InfoCard id={`about-${l.address}`} plain title={l.name} label={t(l.what)} body={l.address}
            lead={<span class="set-mark"><SocialIcon mark={l.mark} /></span>} onOk={() => onQr(l.name, l.address)} />
        </div>
      ))}
      <div class="set-divider inset24" />
      <div class="set-disclaimer">{t("sa_about_disclaimer")}</div>
    </div>
  );
}
