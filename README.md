# KermitGene Acı Çiğ Köfte Yeme Yarışması — İkili Yarış Sürümü

Netlify üzerinde çalışan, iki kişinin farklı zamanlarda aynı yarışa katılabildiği mini tarayıcı oyunu.

## Yarış nasıl işler?

1. İlk kişi kendi adını, rakibinin adını ve kendi figürünü seçerek meydan okuma oluşturur.
2. İlk kişi çiğ köfte yarışını oynar. Süre tutulmaz; yalnızca lokma sayısı kaydedilir.
3. Meydan okuma **Açık Yarışlar** bölümünde görünür.
4. Adı yazılan rakip yarışı seçer, adını doğrular, figürünü seçer ve kendi sırasını oynar.
5. İki skor da kaydedilince yarış tamamlanır; kazanan sonuç listesinde görünür.
6. Skorlar eşitse sonuç **berabere** olarak kaydedilir.
7. Bir gün içinde tamamlanmayan açık yarışlar otomatik olarak silinir ve iptal olur.

## Korunan özellikler

- Kadın / erkek figürü
- Tıklayarak çiğ köfte yeme
- Acı seviyesi göstergesi
- Kaybedenin su içme animasyonu
- Netlify Blobs üzerinde kalıcı kayıt
- Açık yarış listesi
- Tamamlanan yarışların sonuç arşivi
- Sayfa yenilenirse devam eden turun aynı cihazda sürdürülmesi

## Netlify'ye güncelleme

Bu klasör önceki sürümün yerine yüklenmelidir. Projen GitHub üzerinden bağlıysa dosyaları aynı depoda değiştirip commit/push yapman yeterlidir. Manuel yayın yaptıysan Netlify projenin **Deploys** bölümünden güncel klasörü yeniden yükle.

Netlify ayarları `netlify.toml` dosyasından okunur:

- Publish directory: `public`
- Functions directory: `netlify/functions`

## Bilgisayarda deneme

Node.js kurulu olmalıdır.

```bash
npm install
npm run dev
```

## Dosyalar

- `public/index.html`: sayfa ve formlar
- `public/styles.css`: görünüm ve animasyonlar
- `public/app.js`: oyun, açık yarışlar ve sonuç ekranları
- `netlify/functions/races.mjs`: yarış oluşturma, katılma, skor kaydetme ve 24 saatlik temizlik
- `netlify.toml`: Netlify yayın ayarları
- `package.json`: bağımlılıklar ve komutlar

## Oyun ayarı

Her yarışmacının dayanabileceği lokma sayısı tarayıcıda rastgele **7–18** arasında belirlenir. Bu aralığı değiştirmek için `public/app.js` içindeki şu satırı düzenle:

```js
state.tolerance = saved?.tolerance ?? randomInt(7, 18);
```

Sunucu 1–50 arasındaki skorları kabul eder. Daha yüksek bir üst sınır kullanacaksan `netlify/functions/races.mjs` içindeki `normalizeScore` kontrolünü de güncelle.

## Not

Bu eğlence amaçlı başlangıç sürümünde yarış dayanıklılığı ve lokma tıklamaları tarayıcıda çalışır. Büyük ödüllü veya güvenlik gerektiren bir yarışmada oyun turunun tamamen sunucu tarafından doğrulanması gerekir.
