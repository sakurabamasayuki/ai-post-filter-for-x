import { createRoot, type Root } from 'react-dom/client';
import React from 'react';

export function mountShadowUi(
  anchor: HTMLElement,
  Component: React.FC<any>,
  props: any,
  cssText: string
): { root: Root; container: HTMLElement } {
  const container = document.createElement('div');
  const shadow = anchor.attachShadow({ mode: 'open' });
  
  const style = document.createElement('style');
  style.textContent = cssText;
  shadow.appendChild(style);
  shadow.appendChild(container);
  
  const root = createRoot(container);
  root.render(React.createElement(Component, props));
  
  return { root, container };
}
