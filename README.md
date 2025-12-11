# Sasku - Eesti Kaardimäng

Sasku on traditsiooniline Eesti neljamangu kaardimäng kahe meeskonnaga.

## Arendamine

```bash
npm install
npm run dev
```

## Juurutamine

```bash
npm run build
```

Ehitatud failid on `dist/` kaustas.

---

## MÄNGU REEGLID

### Üldine

- **Mängijaid:** 4 (2 meeskonda, meeskonnas 2 mängijat)
- **Meeskonnad:**
  - Meeskond 1: Mängija 0 (Sina) ja Mängija 2 (Partner)
  - Meeskond 2: Mängija 1 ja Mängija 3
- **Kaarte:** 36 kaarti (4 masti × 9 kaarti)
- **Mängijale:** 9 kaarti
- **Eesmärk:** Koguda 12 punkti

### Kaardid

#### Mastid (tugevuselt)
1. **Risti (♣)** - kõige tugevam mast
2. **Poti (♠)**
3. **Ärtu (♥)**
4. **Ruutu (♦)** - kõige nõrgem mast

#### Kaardid mastikollikutes
- **Pildid (alati trumbid):**
  - Kuningas (K) - 4 punkti
  - Emand (Q) - 3 punkti
  - Soldat (J) - 2 punkti

- **Tavalised kaardid:**
  - Äss (A) - 11 punkti
  - Kümme (10) - 10 punkti
  - Üheksa (9) - 0 punkti
  - Kaheksa (8) - 0 punkti
  - Seitse (7) - 0 punkti
  - Kuus (6) - 0 punkti

#### Tugevuse järjekord
- **Pildid (tugevuselt):** K > Q > J
  - Kuningas võidab alati emanda ja soldati
  - Emand võidab alati soldati
  - Mast mõjutab ainult sama väärtusega pilte
  - Näide: Ruutu kuningas (K♦) võidab risti soldatit (J♣)
  - Näide: Risti kuningas (K♣) võidab ruutu kuningat (K♦)

- **Tavalised kaardid (tugevuselt):** A > 10 > 9 > 8 > 7 > 6
  - Tavalised kaardid ei saa kunagi võita pilte

### Mängu käik

#### 1. Pakkumine (Bidding)

**Pakkumise reeglid:**
- Pakkumine käib ringis, alates jagajast
- Igal mängijal on üks kord võimalus pakkuda või passida
- Pakkuda saab ainult: **piltide arv + pikim mast**
  - Näide 1: 3 pilti + 4 kaarti ühes mastis = max pakkumine 7
  - Näide 2: 5 pilti + 4 kaarti ühes mastis = max pakkumine 9
  - Näide 3: 9 pilti + 0 kaarti (kõik pildid) = max pakkumine 9
- **Maksimaalne pakkumine on alati 9**
- Uus pakkumine peab olema eelmisest suurem
- Kui kõik passivad → "üleküla ruutu" (trump on automaatselt ruutu)
- Kui kolm passivad → kõrgeim pakkuja võidab ja valib trumpi

**AI pakkumise loogika (muudetav):**
- Pakub kui maksimaalne pakkumine ≥ 7
- Kui keegi pole veel pakkunud ja max ≥ 5, pakub 5-10 vahel

#### 2. Trumpi valimine

- Pakkumise võitnud mängija valib trumpimasti
- **Saad valida ainult neid maste, mis vastavad sinu pakkumisele**
  - Näide: Pakud 7, sul on 4 pilti + 3 risti + 1 poti + 1 ärtu → saad valida ainult risti
  - Kui on mitu sama pikkusega masti, võid valida nende seast
- **Erireegel: Ruutu saab ALATI valida** (olenemata pakkumisest)
- **"Ruutu" nupp pakkumise ajal:** Paku automaatselt ja vali kohe ruutu trump (saad 4 punkti võites)
- Trump kehtib kogu vooru
- Pildid on alati trumbid (olenemata valitud mastist)

#### 3. Pildi andmine (Picture Giving)

**Reeglid:**
- Kui trumpi tegijal on **täpselt 1 pilt** ja partneril **vähem kui 9 pilti**
- Trumpi tegija saab anda oma pildi partnerile
- Vastutasuks saab ta partnerilt ühe kaardi
- See on valikuline

#### 4. Mängimine

**Tihide reeglid:**
- Esimese tihi alustab mängija, kes on jagajast järgmine
- Tihi võitja alustab järgmist tihhi
- Iga tihi koosneb 4 kaardist (üks igalt mängijalt)

**Kaardi mängimise reeglid:**

1. **Kui alustatakse trumpiga (pilt VÕI trumpimasti kaart):**
   - Pead mängima trumpi, kui sul on (pilt või trumpimasti kaart)
   - Pead ülbi lööma, kui saad (suurema trumpi panema)
   - Kui üle ei saa, pead panema väiksema trumpi
   - Kui sul pole ühtegi trumpi ega pilti, võid mängida mis tahes kaardi

2. **Kui alustatakse mitte-trumpi tavalise kaardiga:**
   - Pead järgima masti, kui sul on
   - Pole kohustust ülbi lüüa
   - Kui sul pole seda masti, võid mängida mis tahes kaardi (sh pilte/trumpi)

3. **TÄHTIS:** Trumpi (pilt või trumpimasti kaart) peab alati ülbi lööma, kui võimalik!

**Tihi võitja määramine:**
1. Pilt võidab alati tavalise kaardi
2. Piltide vahel:
   - Kõrgem väärtus võidab (K > Q > J)
   - Võrdse väärtuse korral võidab tugevama masti kaart
3. Tavalistel kaartidel:
   - Trump võidab mitte-trumpi
   - Sama masti korral kõrgem kaart võidab
   - Eri mastid (ei ole trump) → esimene mängitud kaart (must follow suit)

### Punktiarvestus

#### Voor läbi
- Kokku on mängus 120 punkti (kõigi kaartide punktid kokku)

#### Võidu määramine

**Üleküla ruutu (kõik passisid):**
- Rohkem punkte kogunud meeskond saab **2 punkti**
- Viik (pokk) → mõlemad 0 punkti, mäng uuesti

**Normaalne mäng (keegi pakkus):**

1. **Karvane** (üks meeskond sai kõik 9 tihhi):
   - Saab **6 punkti**

2. **Trump võitis** (trumpi tegija meeskond sai ≥61 punkti):
   - **2 punkti** (või 4 punkti kui trump oli ruutu)
   - **+2 punkti (Jänn)** kui vastane sai alla 30 punkti

3. **Trump kaotati** (trumpi tegija meeskond sai <61 punkti):
   - Vastane saab **4 punkti** (ruutu) või **2 punkti** (muud mastid)
   - **+2 punkti beenus** trumpi ülelöömise eest
   - **+2 punkti (Jänn)** kui trumpi tegija sai alla 30 punkti
   - **Kokku maksimaalselt:** 4+2+2 = **8 punkti** (ruutu) või 2+2+2 = **6 punkti** (muud)

#### Mängu võit
- Esimene meeskond, kes kogub **12 punkti**, võidab mängu

### Muudetavad parameetrid

Koodis saad muuta:

**Punktisüsteem** (`gameState.js`, rida 325-383):
- Üleküla ruutu: 2 punkti
- Karvane: 6 punkti
- Trump võit: 2 punkti (muud) / 4 punkti (ruutu)
- Trump löödud: 2 punkti (muud) / 4 punkti (ruutu) + 2 punkti beenus
- Jänni boonus: +2 punkti (alla 30 punkti)
- Võiduks vajalik: 12 punkti

**AI strateegia** (`ai.js`):
- Pakkumise lävend (rida 18): `maxPossibleBid >= 7`
- Esialgne pakkumine (rida 23): `maxPossibleBid >= 5`
- Kaartide mängimise loogika (read 52-96)

**Mängureeglid** (`gameState.js`):
- Pakkumise reeglid (rida 57-64)
- Kaardi mängimise reeglid (rida 125-158)
- Tihi võitja määramine (rida 202-250)

**UI/UX** (CSS failid):
- Kaartide suurus
- Värvid ja taustad
- Animatsioonid
- Mobiilivaade

---

## Tehnoloogiad

- React 19
- Vite
- CSS3

## Litsents

MIT
