// Public test streams, only for development; a real playlist replaces them in the next stage.
const DEMO = `#EXTM3U
#EXTINF:-1 group-title="Новости",Новости 24
https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8
#EXTINF:-1 group-title="Новости",Первый канал HD
https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8
#EXTINF:-1 group-title="Кино",Кино ТВ
https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8
#EXTINF:-1 group-title="Кино",Комедия
https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8
#EXTINF:-1 group-title="Кино",Discovery Channel
https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8
#EXTINF:-1 group-title="Спорт",Матч ТВ
https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8
#EXTINF:-1 group-title="Спорт",Eurosport
https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8
#EXTINF:-1 group-title="Детям",Мультфильмы
https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8
#EXTINF:-1 group-title="Музыка",Europa Plus TV
https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8
#EXTINF:-1 group-title="Музыка",MTV
https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8
`;

export function demoText(): string {
  return DEMO;
}
