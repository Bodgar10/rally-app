/** @type {import('tailwindcss').Config} */
module.exports = {
  // NativeWind preset — obligatorio para React Native
  presets: [require('nativewind/preset')],
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // —— Tokens base (Doc D §2.1) ——————————————————————————
        bg:           '#0B0B0D',
        surface:      '#17171C',
        'surface-2':  '#202027',
        text:         '#F4F1E9',
        muted:        '#928E84',
        champagne:    '#E9DDB6',
        gold:         '#D4AF37',
        'gold-bright':'#F1D98C',
        'gold-deep':  '#9C7A28',
        // line / line-soft se aplican directo con opacity en className o con arbitrary
        // —— Tokens semánticos (Doc D §2.2) ——————————————————————
        live:         '#42D6A4',
        alive:        '#E6B450',
        danger:       '#E0726F',
        wine:         '#7E2C3D',
        'wine-deep':  '#4A141F',
        // —— Texto sobre fondos de color ————————————————————————
        'on-gold':    '#1A1407',
        'on-wine':    '#F7EAC6',
      },
      borderRadius: {
        // Doc D §5 — radios canónicos
        xs:   '7px',
        sm:   '11px',
        md:   '13px',
        lg:   '16px',
        xl:   '18px',
        '2xl':'24px',
        pill: '9999px',
      },
      fontFamily: {
        // Doc D §3 — dos familias, nada más
        display: ['Oswald'],
        body:    ['Inter'],
      },
      fontSize: {
        // Doc D §3.1 — escala tipográfica
        'display-xl': ['74px', { lineHeight: '0.9' }],
        'display-l':  ['40px', {}],
        'screen-h1':  ['28px', { letterSpacing: '0.01em' }],
        'metric':     ['22px', {}],
        'h1-inline':  ['18px', {}],
        'card-name':  ['16px', {}],
        'section':    ['13px', { letterSpacing: '0.14em' }],
        'eyebrow':    ['11px', { letterSpacing: '0.22em' }],
        body:         ['12px', { lineHeight: '1.5' }],
        caption:      ['11px', {}],
      },
      spacing: {
        // Doc D §4 — escala de espaciado
        '1':  '4px',
        '1.5':'6px',
        '2':  '8px',
        '2.5':'10px',
        '3':  '12px',
        '3.5':'14px',
        '4':  '16px',
        '4.5':'18px',
        '5':  '20px',
        '6':  '24px',
      },
    },
  },
  plugins: [],
};
