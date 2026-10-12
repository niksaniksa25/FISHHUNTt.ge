# Wildlife restriction data

`js/wildlife-rules.js` presents legal restrictions separately from biological activity and weather scores. It never returns an unconditional “allowed” status. A date inside a species window still requires an eligible place, method, documents and personal permission.

Sources were read on **12 October 2026**:

- [DES hunting season page](https://des.gov.ge/Ge/HuntingSeason): current 2026 notice and archived 2025 notice; openings 22 August 2026 and 23 August 2025. The published species table supplies periods and daily limits. Mallard has different periods and limits for Akhalkalaki, Ninotsminda, Tsalka and Dmanisi. The current 2026 notice gives reserve buffers of 500 metres and national park buffers of 250 metres. The older FAQ/PDF gives different buffers, so the current notice is used.
- [DES official mirror of Government Decree №423](https://des.gov.ge/Ge/Files/Download/1056): fishing regulation, including amendments through 2018; the PDF was generated 1 June 2018. Article 4(3) explicitly exempts amateur/sport and scientific fishing from the water-body closures in that paragraph. These closures must **not** be presented as universal rod-fishing bans. Article 5 separately protects sturgeon, Black Sea salmon and wild river/lake trout, and closes turbot fishing from 1 May until 1 July. Articles 4(2) and 13 separately restrict places and methods.
- [DES official mirror of Government Decree №190](https://des.gov.ge/Ge/Files/Download/1065): Georgian Red List, adopted 20 February 2014. Species matching uses scientific identities and known scientific synonyms, not guesses based on Georgian common names.
- [DES official mirror of the Red List/Red Book law](https://des.gov.ge/Ge/Files/Download/1012): Articles 10 and 22 protect listed species, with written ministry consent for exceptional conservation/scientific purposes. Ordinary hunting permission is not such consent.
- [DES official mirror of Ministerial Order №95](https://des.gov.ge/Ge/Files/Download/1091): published PDF includes amendments through August 2018. Article 3 distinguishes migratory-bird hunting from hunting on specifically designated territories. The current 2026 season notice overrides the older PDF opening and buffer information.
- [DES FAQ](https://des.gov.ge/Ge/Faq): documents for migratory-bird hunting and method conditions. Do not use its older protected-area buffer summary over the 2026 notice.

## Limits of the automatic check

The Matsne website returned an origin “Access Denied” response, so the latest consolidated fishing act could not be independently confirmed. The UI explicitly states the age of the DES fishing PDF and links to Matsne for the current edition. It does not claim that every local decision or recent amendment is covered.

The fishing PDF truncates some text at the right edge. In particular the starting date of the special closed period for catch-and-release trout could not be read reliably. Therefore wild-trout retention is prohibited, while release fishing is marked conditional with its exact dates/instruction explicitly unconfirmed. It is never labelled unrestricted.

The 15 February end wording for quail and several pigeons is “until 15 February”. The boundary day is displayed as requiring confirmation rather than silently choosing an inclusive interpretation. March 1 is treated as closed: the current department announcement says the preceding season finished on February 28.

Only seasons starting in 2025 and 2026 are bundled. No future opening is inferred by computing the fourth Saturday. Dates outside the supported season years get an unverified status. Civil dates use `Asia/Tbilisi`, including the date input defaults.

Unknown species are not labelled protected merely because they are absent from the migratory-bird table. Mammals require a separately verified territory and permission; paying the migratory-bird fee does not authorize mammal hunting. Catalog entries and activity forecasts do not prove legal eligibility.

## Maintaining the data

Check the current consolidated act and the new official season notice before updating dates, limits, protected identities or method exceptions. Record the source version and review date, preserve jurisdiction/municipality scope, and update tests for both sides of every affected date boundary. Keep cases without sufficient evidence visibly unverified.
