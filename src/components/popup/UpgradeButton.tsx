import { Button } from "../ui/button";

interface Props {
  checkoutUrl?: string;
  className?: string;
}

const DEFAULT_CHECKOUT_URL = "https://app.lemonsqueezy.com/share/1049095";
const YEARLY_CHECKOUT_URL = "https://app.lemonsqueezy.com/share/1049095";

/**
 * Pro 版アップグレード用ボタン。
 * LemonSqueezy Checkout を新しいタブで開く。
 */
export function UpgradeButton({
  checkoutUrl = DEFAULT_CHECKOUT_URL,
  className,
}: Props): JSX.Element {
  const handleClick = () => {
    try {
      const url = checkoutUrl;
      if (chrome?.tabs?.create) {
        void chrome.tabs.create({ url, active: true });
      } else {
        window.open(url, "_blank", "noopener,noreferrer");
      }
    } catch (e) {
      console.error("[AIPF] failed to open checkout", e);
    }
  };

  return (
    <Button
      onClick={handleClick}
      className={
        "w-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white " +
        (className ?? "")
      }
    >
      ✨ Pro版を購入(月額500円〜)
    </Button>
  );
}
