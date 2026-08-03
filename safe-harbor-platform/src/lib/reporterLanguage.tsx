import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from "react";

export type ReporterLanguage = "en" | "zu" | "st";

type TranslationDictionary = Record<string, Partial<Record<Exclude<ReporterLanguage, "en">, string>>>;

const STORAGE_KEY = "safeguard_reporter_language";

export const reporterLanguages: Array<{ code: ReporterLanguage; label: string }> = [
  { code: "en", label: "English" },
  { code: "zu", label: "isiZulu" },
  { code: "st", label: "Sesotho" },
];

const translations: TranslationDictionary = {
  "Reporter Dashboard": { zu: "Ideshibhodi Yombiki", st: "Dashboard ya Mmelli" },
  "Report, track, and access support": { zu: "Bika, landelela, futhi uthole ukwesekwa", st: "Tlaleha, latela, mme o fumane tshehetso" },
  Overview: { zu: "Isifinyezo", st: "Kakaretso" },
  "Create Report": { zu: "Dala Umbiko", st: "Etsa Tlaleho" },
  "Emergency Alert": { zu: "Isaziso Esiphuthumayo", st: "Tlhokomeliso ya Tshohanyetso" },
  "Track Case": { zu: "Landelela Icala", st: "Latela Nyewe" },
  "Safety Map": { zu: "Imephu Yokuphepha", st: "Mapa wa Polokeho" },
  Settings: { zu: "Izilungiselelo", st: "Dipeakanyo" },
  Collapse: { zu: "Nciphisa", st: "Mena" },
  "Sign Out": { zu: "Phuma", st: "Tswa" },
  "Open navigation": { zu: "Vula ukuzulazula", st: "Bula menyu" },
  "Close navigation": { zu: "Vala ukuzulazula", st: "Kwala menyu" },
  Welcome: { zu: "Siyakwamukela", st: "Re a o amohela" },
  "Loading...": { zu: "Iyalayisha...", st: "E a kenya..." },
  User: { zu: "Umsebenzisi", st: "Mosebedisi" },
  "Welcome back": { zu: "Siyakwamukela futhi", st: "Re a o amohela hape" },
  "Your reporting and support overview": { zu: "Isifinyezo sokubika nokwesekwa kwakho", st: "Kakaretso ya ditlaleho le tshehetso ya hao" },
  "Reports Filed": { zu: "Imibiko Efakiwe", st: "Ditlaleho Tse Kentsoeng" },
  "Resolved Reports": { zu: "Imibiko Exazululiwe", st: "Ditlaleho Tse Rarolotsweng" },
  "Resolved Alerts": { zu: "Izaziso Ezixazululiwe", st: "Ditlhokomeliso Tse Rarolotsweng" },
  "Recent Activity": { zu: "Okwenzekile Muva", st: "Diketso tsa Morao tjena" },
  "No activity yet": { zu: "Akukho okwenzekile okwamanje", st: "Ha ho ketso ho fihlela jwale" },
  "File Your Report": { zu: "Faka Umbiko Wakho", st: "Kenya Tlaleho ya Hao" },
  "Report an incident confidentially. Your safety is our priority. Provide as much detail as you're comfortable sharing.": {
    zu: "Bika isigameko ngokuyimfihlo. Ukuphepha kwakho kubalulekile kithi. Nikeza imininingwane ozizwa ukhululekile ukuyabelana ngayo.",
    st: "Tlaleha ketsahalo ka lekunutu. Polokeho ya hao ke ntho ya bohlokwa ho rona. Fana ka dintlha tseo o phutholohileng ho di arolelana.",
  },
  "Incident Details": { zu: "Imininingwane Yesigameko", st: "Dintlha tsa Ketsahalo" },
  "Attach Evidence": { zu: "Namathisela Ubufakazi", st: "Kenya Bopaki" },
  "Review & Submit": { zu: "Buyekeza bese Uthumela", st: "Hlahloba mme o Romelle" },
  "Please provide detailed information about the incident": { zu: "Sicela unikeze imininingwane eningiliziwe ngesigameko", st: "Ka kopo fana ka dintlha tse felletseng ka ketsahalo" },
  "Incident Type": { zu: "Uhlobo Lwesigameko", st: "Mofuta wa Ketsahalo" },
  "Select the type of incident...": { zu: "Khetha uhlobo lwesigameko...", st: "Khetha mofuta wa ketsahalo..." },
  "Domestic Violence": { zu: "Udlame Lwasekhaya", st: "Tlhekefetso ya Lapeng" },
  "Sexual Assault": { zu: "Ukuhlaselwa Ngokocansi", st: "Tlhaselo ya Thobalano" },
  Stalking: { zu: "Ukulandela Ngokuhlupha", st: "Ho Latela ka Tshoso" },
  Harassment: { zu: "Ukuhlukumeza", st: "Tlhekefetso" },
  "Human Trafficking": { zu: "Ukushushumbiswa Kwabantu", st: "Kgwebo ya Batho" },
  "Child Abuse": { zu: "Ukuhlukunyezwa Kwezingane", st: "Tlhekefetso ya Bana" },
  "Forced Marriage": { zu: "Umshado Ophoqelelwe", st: "Lenyalo le Qobellwang" },
  "Honor-Based Violence": { zu: "Udlame Olususelwa Esithunzini", st: "Tlhekefetso ya Botumo" },
  "Online / Cyber Abuse": { zu: "Ukuhlukumeza Ku-inthanethi", st: "Tlhekefetso ya Inthanete" },
  Other: { zu: "Okunye", st: "Tse ding" },
  Date: { zu: "Usuku", st: "Letsatsi" },
  Location: { zu: "Indawo", st: "Sebaka" },
  "Where did this happen?": { zu: "Kwenzeke kuphi lokhu?", st: "Sena se etsahetse hokae?" },
  "Use my current location": { zu: "Sebenzisa indawo yami yamanje", st: "Sebedisa sebaka sa ka sa jwale" },
  Description: { zu: "Incazelo", st: "Tlhaloso" },
  "Describe what happened in detail. Include who, what, when, and where...": {
    zu: "Chaza okwenzekile ngokuningiliziwe. Faka ukuthi ubani, ini, nini, kuphi...",
    st: "Hlalosa se etsahetseng ka botlalo. Kenyeletsa mang, eng, neng, le hokae...",
  },
  "Your information remains confidential unless you provide personal details.": {
    zu: "Ulwazi lwakho luhlala luyimfihlo ngaphandle uma unikeza imininingwane yomuntu siqu.",
    st: "Tlhahisoleseding ya hao e dula e le lekunutu ntle le ha o fana ka dintlha tsa botho.",
  },
  "Click the pin to auto-fill your current location": {
    zu: "Chofoza iphini ukuze indawo yakho yamanje igcwaliswe ngokuzenzakalela",
    st: "Tobetsa phini ho tlatsa sebaka sa hao sa jwale ka boiketsetso",
  },
  "Continue to Evidence": { zu: "Qhubekela Ebufakazini", st: "Tswela Pele ho Bopaki" },
  Back: { zu: "Emuva", st: "Morao" },
  "Continue to Review": { zu: "Qhubekela Ekubuyekezeni", st: "Tswela Pele ho Hlahloba" },
  "Submit Report": { zu: "Thumela Umbiko", st: "Romela Tlaleho" },
  "Upload Evidence": { zu: "Layisha Ubufakazi", st: "Kenya Bopaki" },
  "Drag & drop or click to upload": { zu: "Hudula bese uphonsa noma uchofoze ukuze ulayishe", st: "Hula o lahlele kapa o tobetse ho kenya" },
  Browse: { zu: "Phequlula", st: "Batla" },
  "Attached Files": { zu: "Amafayela Anamathiselwe", st: "Difaele Tse Kentsweng" },
  Preview: { zu: "Buka Kuqala", st: "Sheba Pele" },
  "Voice Testimony": { zu: "Ubufakazi Bezwi", st: "Bopaki ba Lentswe" },
  "Record your statement": { zu: "Rekhoda isitatimende sakho", st: "Rekota polelo ya hao" },
  Record: { zu: "Rekhoda", st: "Rekota" },
  Stop: { zu: "Misa", st: "Emisa" },
  "Re-record": { zu: "Rekhoda kabusha", st: "Rekota hape" },
  Add: { zu: "Engeza", st: "Eketsa" },
  Translate: { zu: "Humusha", st: "Fetolela" },
  "Review your report details before submission": { zu: "Buyekeza imininingwane yombiko wakho ngaphambi kokuthumela", st: "Hlahloba dintlha tsa tlaleho ya hao pele o romela" },
  "Please review your report details before submission": { zu: "Sicela ubuyekeze imininingwane yombiko wakho ngaphambi kokuthumela", st: "Ka kopo hlahloba dintlha tsa tlaleho ya hao pele o romela" },
  "Audio translation requested": { zu: "Kucelwe ukuhumusha umsindo", st: "Ho kopilwe phetolelo ya modumo" },
  "Evidence": { zu: "Ubufakazi", st: "Bopaki" },
  "Evidence Files": { zu: "Amafayela Obufakazi", st: "Difaele tsa Bopaki" },
  "No evidence": { zu: "Abukho ubufakazi", st: "Ha ho bopaki" },
  "Image Preview": { zu: "Ukubuka Isithombe", st: "Ponelopele ya Setshwantsho" },
  "Audio Playback": { zu: "Ukudlala Umsindo", st: "Ho Bapala Modumo" },
  Close: { zu: "Vala", st: "Kwala" },
  "Emergency Alert (SOS)": { zu: "Isaziso Esiphuthumayo (SOS)", st: "Tlhokomeliso ya Tshohanyetso (SOS)" },
  "Instantly alert police officers and your trusted contacts in case of immediate danger. Use only when you need immediate help.": {
    zu: "Xwayisa amaphoyisa nabantu obathembayo ngokushesha uma usengozini. Sebenzisa kuphela uma udinga usizo ngokushesha.",
    st: "Tsebisa mapolesa le batho bao o ba tshepang hanghang ha o le kotsing. Sebedisa feela ha o hloka thuso ya potlako.",
  },
  "Getting your location...": { zu: "Sithola indawo yakho...", st: "Re fumana sebaka sa hao..." },
  "Sending emergency alert...": { zu: "Sithumela isaziso esiphuthumayo...", st: "Re romela tlhokomeliso ya tshohanyetso..." },
  "ACTIVATE SOS": { zu: "VULA I-SOS", st: "BULELA SOS" },
  "Getting your location": { zu: "Sithola indawo yakho", st: "Re fumana sebaka sa hao" },
  "Sending alert": { zu: "Sithumela isaziso", st: "Re romela tlhokomeliso" },
  "Alert sent!": { zu: "Isaziso sithunyelwe!", st: "Tlhokomeliso e rometswe!" },
  "Try again": { zu: "Zama futhi", st: "Leka hape" },
  "What happens when you activate SOS:": { zu: "Kwenzekani uma uvula i-SOS:", st: "Ho etsahalang ha o bulela SOS:" },
  "Your current GPS location is captured and shared with nearby police officers": {
    zu: "Indawo yakho ye-GPS yamanje iyathathwa bese yabelwa amaphoyisa aseduze",
    st: "Sebaka sa hao sa GPS sa jwale se a nkuwa mme se abelanwa le mapolesa a haufi",
  },
  "Emergency contacts are notified immediately with your location": {
    zu: "Oxhumana nabo besimo esiphuthumayo bayaziswa ngokushesha ngendawo yakho",
    st: "Dikopano tsa tshohanyetso di tsebiswa hanghang ka sebaka sa hao",
  },
  "Your location is updated continuously for responders to track you": {
    zu: "Indawo yakho ibuyekezwa njalo ukuze abasabelayo bakulandelele",
    st: "Sebaka sa hao se ntjhafatswa kgafetsa hore ba thusang ba o latele",
  },
  "You'll receive confirmation when police officers and contacts are notified": {
    zu: "Uzothola ukuqinisekisa uma amaphoyisa noxhumana nabo sebeziwe",
    st: "O tla fumana netefatso ha mapolesa le dikopano ba tsebisitswe",
  },
  "Track Your Case": { zu: "Landelela Icala Lakho", st: "Latela Nyewe ya Hao" },
  "Monitor the progress of your reported case. Check status updates, evidence review progress, and communication from police officers.": {
    zu: "Bheka inqubekelaphambili yecala olibikile. Hlola izibuyekezo zesimo, ubufakazi, nokuxhumana namaphoyisa.",
    st: "Shebella kgatelopele ya nyewe eo o e tlalehileng. Sheba dintlafatso, bopaki, le puisano ya mapolesa.",
  },
  "Search Cases": { zu: "Sesha Amacala", st: "Batla Dinyewe" },
  "Enter case ID or type...": { zu: "Faka i-ID yecala noma uhlobo...", st: "Kenya ID ya nyewe kapa mofuta..." },
  Search: { zu: "Sesha", st: "Batla" },
  Refresh: { zu: "Vuselela", st: "Ntjhafatsa" },
  "Active Cases": { zu: "Amacala Asebenzayo", st: "Dinyewe Tse Sebetsang" },
  "Handled Cases": { zu: "Amacala Aphathwe", st: "Dinyewe Tse Sebeditsweng" },
  "No active cases": { zu: "Awekho amacala asebenzayo", st: "Ha ho dinyewe tse sebetsang" },
  "Loading cases...": { zu: "Kulayishwa amacala...", st: "Ho kenya dinyewe..." },
  "Delete Case?": { zu: "Susa Icala?", st: "Hlakola Nyewe?" },
  "This action cannot be undone.": { zu: "Lesi senzo asikwazi ukubuyiselwa emuva.", st: "Ketso ena e ke ke ya etsollwa." },
  Details: { zu: "Imininingwane", st: "Dintlha" },
  "Delete This Case": { zu: "Susa Leli Cala", st: "Hlakola Nyewe Ena" },
  "Case Timeline": { zu: "Umlando Wecala", st: "Nalane ya Nyewe" },
  "Progress & Notes from Police Officers & NGO": { zu: "Inqubekelaphambili namanothi avela emaphoyiseni ne-NGO", st: "Kgatelopele le dinoutu tse tswang ho mapolesa le NGO" },
  "View high-risk areas and safety information around your current location. Make informed decisions about your safety and surroundings.": {
    zu: "Buka izindawo ezinobungozi nolwazi lokuphepha eduze nendawo yakho yamanje. Yenza izinqumo ezinolwazi ngokuphepha kwakho.",
    st: "Sheba dibaka tse kotsi le tlhahisoleseding ya polokeho haufi le sebaka sa hao. Etsa diqeto tse nang le tsebo.",
  },
  "High-risk areas for gender-based violence near you": {
    zu: "Izindawo ezisengozini enkulu yodlame lobulili eduze nawe",
    st: "Dibaka tse kotsi haholo tsa tlhekefetso ya bong haufi le wena",
  },
  "Your location": { zu: "Indawo yakho", st: "Sebaka sa hao" },
  High: { zu: "Phezulu", st: "Holimo" },
  Medium: { zu: "Phakathi", st: "Mahareng" },
  Low: { zu: "Phansi", st: "Tlase" },
  "Reported High-Risk Areas Near You": { zu: "Izindawo Eziyingozi Ezibikiwe Eduze Nawe", st: "Dibaka Tse Kotsi Tse Tlalehilweng Haufi le Wena" },
  "Total Incidents": { zu: "Izigameko Zizonke", st: "Diketsahalo Tsohle" },
  "High Risk Areas": { zu: "Izindawo Ezinobungozi Obukhulu", st: "Dibaka Tse Kotsi" },
  "Safe Zones": { zu: "Izindawo Eziphephile", st: "Dibaka Tse Bolokehileng" },
  "Loading map...": { zu: "Kulayishwa imephu...", st: "Ho kenya mapa..." },
  "No risk areas found": { zu: "Azikho izindawo zobungozi ezitholakele", st: "Ha ho dibaka tsa kotsi tse fumanweng" },
  "Manage your profile and emergency contacts to keep your information secure and up to date.": {
    zu: "Phatha iphrofayela yakho noxhumana nabo besimo esiphuthumayo ukuze ulwazi lwakho luhlale luphephile futhi luvuselelwe.",
    st: "Laola profaele ya hao le dikopano tsa tshohanyetso hore tlhahisoleseding ya hao e dule e bolokehile ebile e ntjhafaditswe.",
  },
  Profile: { zu: "Iphrofayela", st: "Profaele" },
  "Full Name": { zu: "Igama Eligcwele", st: "Lebitso le Feletseng" },
  Email: { zu: "I-imeyili", st: "Imeile" },
  Gender: { zu: "Ubulili", st: "Bong" },
  "Phone Number": { zu: "Inombolo Yocingo", st: "Nomoro ya Mohala" },
  "Emergency Contacts": { zu: "Oxhumana Nabo Besimo Esiphuthumayo", st: "Dikopano tsa Tshohanyetso" },
  "No emergency contacts saved yet.": { zu: "Akekho oxhumana naye wesimo esiphuthumayo ogciniwe okwamanje.", st: "Ha ho dikopano tsa tshohanyetso tse bolokilweng." },
  Relationship: { zu: "Ubudlelwano", st: "Kamano" },
  "Email Address": { zu: "Ikheli Le-imeyili", st: "Aterese ya Imeile" },
  "Trusted Contact Phone": { zu: "Ucingo Lomuntu Othembekile", st: "Mohala wa Motho ya Tshepilweng" },
  Edit: { zu: "Hlela", st: "Fetola" },
  Delete: { zu: "Susa", st: "Hlakola" },
  Save: { zu: "Gcina", st: "Boloka" },
  Cancel: { zu: "Khansela", st: "Hlakola" },
  "Add New Contact": { zu: "Engeza Oxhumana Naye Omusha", st: "Eketsa Kopano e Ntjha" },
  "Save Settings": { zu: "Gcina Izilungiselelo", st: "Boloka Dipeakanyo" },
  "Select gender": { zu: "Khetha ubulili", st: "Khetha bong" },
  Female: { zu: "Owesifazane", st: "Mosadi" },
  Male: { zu: "Owesilisa", st: "Monna" },
  "Prefer not to say": { zu: "Ngikhetha ukungasho", st: "Ke kgetha ho se bue" },
  "Invalid Email Address": { zu: "Ikheli le-imeyili alilungile", st: "Aterese ya imeile ha e sebetse" },
  "Invalid Phone Number": { zu: "Inombolo yocingo ayilungile", st: "Nomoro ya mohala ha e sebetse" },
  "Settings saved!": { zu: "Izilungiselelo zigciniwe!", st: "Dipeakanyo di bolokilwe!" },
};

const reverseTranslations = Object.entries(translations).reduce<Record<string, string>>((acc, [english, values]) => {
  acc[english] = english;
  Object.values(values).forEach((value) => {
    if (value) acc[value] = english;
  });
  return acc;
}, {});

const preserveWhitespace = (original: string, replacement: string) => {
  const leading = original.match(/^\s*/)?.[0] || "";
  const trailing = original.match(/\s*$/)?.[0] || "";
  return `${leading}${replacement}${trailing}`;
};

const translatePhrase = (value: string, language: ReporterLanguage) => {
  const trimmed = value.trim();
  if (!trimmed) return value;

  const english = reverseTranslations[trimmed] || trimmed;
  const translated = language === "en" ? english : translations[english]?.[language] || english;

  return translated === trimmed ? value : preserveWhitespace(value, translated);
};

const translatedAttributes = ["placeholder", "title", "aria-label"];

const translateElement = (element: Element, language: ReporterLanguage) => {
  translatedAttributes.forEach((attr) => {
    const value = element.getAttribute(attr);
    if (value) {
      const translated = translatePhrase(value, language);
      if (translated !== value) {
        element.setAttribute(attr, translated);
      }
    }
  });
};

const translateNode = (node: Node, language: ReporterLanguage) => {
  if (node.nodeType === Node.TEXT_NODE) {
    const currentText = node.textContent || "";
    const translated = translatePhrase(currentText, language);
    if (translated !== currentText) {
      node.textContent = translated;
    }
    return;
  }

  if (node.nodeType !== Node.ELEMENT_NODE) return;

  const element = node as Element;
  if (element.closest("[data-no-reporter-translate]")) return;

  translateElement(element, language);
  element.childNodes.forEach((child) => translateNode(child, language));
};

type ReporterLanguageContextValue = {
  language: ReporterLanguage;
  setLanguage: (language: ReporterLanguage) => void;
  t: (text: string) => string;
};

const ReporterLanguageContext = createContext<ReporterLanguageContextValue>({
  language: "en",
  setLanguage: () => undefined,
  t: (text) => text,
});

export const ReporterLanguageProvider = ({ children }: { children: ReactNode }) => {
  const [language, setLanguageState] = useState<ReporterLanguage>(() => {
    if (typeof window === "undefined") return "en";
    const stored = localStorage.getItem(STORAGE_KEY) as ReporterLanguage | null;
    return stored && reporterLanguages.some((item) => item.code === stored) ? stored : "en";
  });

  const setLanguage = (nextLanguage: ReporterLanguage) => {
    setLanguageState(nextLanguage);
    localStorage.setItem(STORAGE_KEY, nextLanguage);
  };

  useEffect(() => {
    const applyTranslations = () => {
      const scope = document.querySelector("[data-reporter-translate-scope]");
      if (scope) translateNode(scope, language);
    };

    applyTranslations();
    const scope = document.querySelector("[data-reporter-translate-scope]");
    if (!scope) return undefined;

    const observer = new MutationObserver(() => applyTranslations());
    observer.observe(scope, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: translatedAttributes,
    });

    return () => observer.disconnect();
  }, [language]);

  const value = useMemo<ReporterLanguageContextValue>(
    () => ({
      language,
      setLanguage,
      t: (text: string) => translatePhrase(text, language).trim(),
    }),
    [language]
  );

  return (
    <ReporterLanguageContext.Provider value={value}>
      {children}
    </ReporterLanguageContext.Provider>
  );
};

export const useReporterLanguage = () => useContext(ReporterLanguageContext);
