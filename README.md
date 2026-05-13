\# AI Post Filter for X



x.com (Twitter) のタイムラインから AI 生成投稿を検出し、ぼかし / 非表示 / ラベル表示するブラウザ拡張機能です。



\## 技術スタック



\- WXT

\- TypeScript (strict)

\- React 18

\- Tailwind CSS

\- shadcn/ui

\- Manifest V3

\- Chrome / Firefox 対応

\- pnpm



\## プロジェクト構成



```txt

entrypoints/

&#x20; background.ts

&#x20; content.ts

&#x20; popup/

&#x20;   index.html

&#x20;   main.tsx

&#x20; options/

&#x20;   index.html

&#x20;   main.tsx



src/

&#x20; components/ui/button.tsx

&#x20; lib/utils.ts

&#x20; styles/globals.css



