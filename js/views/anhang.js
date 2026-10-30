// Leseansicht für einen Anhang (E56): PDF oder Bild aus News oder Forum, mit dem Leser der Zeitungen (reader.js).
// Aufruf: #/anhang/<Drive-ID>?name=…&mime=…&zurueck=<Seite, auf der der Anhang steht>
import { openReader } from './reader.js';
import { anhangLesbar } from '../backend/common.js';

export default async function anhang(ctx) {
  const { app, params, query } = ctx;
  const b = app.backend;
  const mime = String(query.mime || 'application/pdf');
  const a = { id: String(params.id || ''), name: String(query.name || 'Anhang').slice(0, 100), mime, mimeType: mime };
  const zurueck = /^#\/[\w%./?=&-]*$/.test(String(query.zurueck || '')) ? query.zurueck : '#/';
  return openReader(ctx, {
    label: `${a.name} lesen`,
    heading: a.name,
    back: zurueck,
    loading: 'Anhang wird geladen …',
    downloading: 'Anhang wird heruntergeladen …',
    openLabel: 'Anhang herunterladen',
    split: false,
    hardCover: false,
    async find() {
      if (!a.id || !anhangLesbar(a.mime)) throw Object.assign(new Error('Diesen Anhang zeigt die App nicht an – bitte herunterladen.'), { status: 404 });
      return a;
    },
    title: () => a.name,
    isImage: () => a.mime.startsWith('image/'),
    openUrl: () => b.anhangOpenUrl(a),
    load: (x, onProgress) => b.loadAnhang(x, onProgress),
  });
}
