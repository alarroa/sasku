# Sasku Mängu Deployment Juhised

Mäng on valmis ja saad seda deployda mitmel erineval viisil:

## Variant 1: Netlify Drop (Kõige lihtsam!)

1. Mine [Netlify Drop](https://app.netlify.com/drop) lehele
2. Logi sisse või loo tasuta konto
3. Lihtsalt lohistada `dist` kaust brauserisse
4. Valmis! Saad kohe URLi

## Variant 2: Vercel

1. Installi Vercel CLI: `npm i -g vercel`
2. Käivita projektikaustas: `vercel`
3. Järgi juhiseid
4. Valmis!

## Variant 3: GitHub Pages (kui sul on õigused)

1. Mine GitHub repo Settings -> Pages
2. Vali Source: "Deploy from a branch"
3. Vali branch: `gh-pages`
4. Salvesta
5. Või käivita: `npm run deploy` (kui õigused olemas)

## Variant 4: Käivita lokaalselt

```bash
npm install
npm run dev
```

Seejärel ava: http://localhost:5173/

## Build käsitsi

```bash
npm run build
```

Tulemused on `dist` kaustas, mida saad käsitsi üles laadida igale staatilisele hosting teenusele.

## Hetkel töötav versioon

Mäng on täielikult funktsionaalne:
- ✅ Pakkumissüsteem
- ✅ Trump valik
- ✅ Kaartide mängimine
- ✅ 3 AI vastast
- ✅ Punktiarvestus
- ✅ Mitme vooru mäng (12 punktini)

Hea mängu!
