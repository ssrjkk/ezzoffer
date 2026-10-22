import { ImageResponse } from 'next/og';

// OG-картинка без единого ассета: текст + цвета палитры сайта.
// Репосты в соцсетях без неё уходили голыми — ни превью, ни названия.
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '80px',
          backgroundColor: '#f7f4ec',
          color: '#1a1714',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ fontSize: 28, letterSpacing: 6, color: '#8a8478' }}>EZOFFER</div>
        <div style={{ fontSize: 64, fontWeight: 700, lineHeight: 1.1, marginTop: 24 }}>
          Поиск работы без рутины
        </div>
        <div style={{ fontSize: 30, marginTop: 24, color: '#4a453c' }}>
          Подбор по резюме · письма · автоотклики · 24 часа бесплатно
        </div>
      </div>
    ),
    { ...size },
  );
}
