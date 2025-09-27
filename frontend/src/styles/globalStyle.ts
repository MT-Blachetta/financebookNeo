/**
 * Global StyleSheet using 'styled-components'.
 *
 * – Implements a modern CSS reset (inspired by Josh W. Comeau's reset)
 * – Defines CSS custom properties (design-tokens) for colours, spacing, etc.
 * – Sets default typography that mirrors professional finance dashboards
 */

import { createGlobalStyle } from 'styled-components';

export const GlobalStyle = createGlobalStyle`
  *,*::before,*::after{
    box-sizing:border-box;
  }
  *{
    margin:0;
  }
  html,body{
    height:100%;
  }
  body{
    line-height:1.5;
    -webkit-font-smoothing:antialiased;
    background:#000;          /* page bg */
    color:#eaeaea;            /* default text */
    font-family: 'Inter', ui-sans-serif, system-ui, -apple-system,
      BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell,
      'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif;
    font-size: 16px;
  }
  img,picture,video,canvas,svg{
    display:block;
    max-width:100%;
  }
  input,button,textarea,select{
    font:inherit;
  }
  p,h1,h2,h3,h4,h5,h6{
    overflow-wrap:break-word;
  }
  #root,#__next{
    isolation:isolate;
  }

   // Design tokens
  :root {
    --color-bg: #000000;
    --color-surface: #1c1c1c;
    --color-text-primary: #eaeaea;
    --color-text-secondary: #9e9e9e;

    --color-positive: #2ecc71; /* green */
    --color-negative: #e74c3c; /* red */

    --radius-lg: 0.75rem;
    --radius-md: 0.5rem;

    --spacing-xs: 0.25rem;
    --spacing-sm: 0.5rem;
    --spacing-md: 1rem;
    --spacing-lg: 1.5rem;
  }

  a {
    color: var(--color-positive);
    text-decoration: none;
  }

  /* Scrollbar styling (WebKit) to fit dark theme */
  ::-webkit-scrollbar {
    width: 8px;
    height: 8px;
  }
  ::-webkit-scrollbar-thumb {
    background: var(--color-surface);
    border-radius: 4px;
  }
  ::-webkit-scrollbar-thumb:hover {
    background: #333;
  }
`;