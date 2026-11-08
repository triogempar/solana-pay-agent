import type { Locale } from "./types";

const INDONESIAN =
  /\b(saya|anda|saldo|kirim|kirimkan|simpan|sebagai|transaksi|berapa|tolong|alamat|dompet|terakhir|kepada|uang|biaya|jelaskan|tunjukkan|tampilkan|bantu|ke)\b/i;

export function detectLocale(text: string): Locale {
  return INDONESIAN.test(text) ? "id" : "en";
}
