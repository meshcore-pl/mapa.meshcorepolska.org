# Polska mapa MeshCore 🗺️
Interaktywna mapa węzłów sieci MeshCore w Polsce i na świecie.
Projekt składa się z frontendu oraz backendu napisanego w Node.js. Backend pobiera dane o węzłach z publicznego API map.meshcore.dev i przechowuje je w pamięci procesu oraz Redis.

## Czym się wyróżnia?
- Polskojęzyczny interfejs.
- Możliwość przełączania między węzłami z Polski i całego świata.
- Udostępnianie wybranego węzła lub kontaktu za pomocą bezpośredniego linku.
- Kopiowanie danych węzłów i kontaktów do schowka.
- Polska jako domyślnie wybrany region przy pierwszym uruchomieniu.
- Dane przesyłane w kompaktowym formacie MessagePack; przy domyślnym widoku pobierane są tylko węzły z Polski.
- Wyszukiwanie węzłów po nazwie i kluczu publicznym, z obsługą klawiatury.
- Frontend zbudowany w HTML, CSS i JavaScript bez frameworka aplikacyjnego, nowoczesny kod.

## Plany
Planowany jest serwis `meshcoreprofiles.com`, zintegrowany z mapą węzłów z całego świata.

- Użytkownicy, którzy podadzą swoje dane, otrzymają własny profil.
- Wybrane informacje z profili będą widoczne bezpośrednio na mapie, dzięki czemu będzie można łatwo sprawdzić, do kogo należy dany węzeł.
- Właściciele repeaterów będą mogli przesyłać ich zdjęcia, które następnie zostaną publicznie wyświetlone w serwisie.

Testowa wersja konfiguratora jest obecnie dostępna wyłącznie dla użytkowników serwera [Discord MeshCore Polska](https://meshcorepolska.org/discord) (komenda `/konfigurator` od `Sefi#6347`). [Zobacz przykładowy profil](https://beta.sefinek.net/meshcore-pl/kontakty/6a43efd454feb8be5679e0a6).

## Wymagania
- Node.js >=20.19.0
- Redis
- Dostęp do internetu w celu pobierania danych źródłowych

## Instalacja
```bash
git clone https://github.com/meshcore-pl/map.git mapa.meshcorepolska.org
cd mapa.meshcorepolska.org
npm install
cp .env.example .env
```

Następnie uzupełnij dane dostępowe do Redis w utworzonym pliku `.env`.

Uruchom serwer poleceniem:
```bash
node .
```

Mapa będzie dostępna domyślnie pod adresem `http://127.0.0.1:8080`.

## API
Backend udostępnia dane w formacie MessagePack pod adresem:

```text
GET /api/v1/nodes
```

Domyślnie zwracane są węzły znajdujące się w Polsce. Parametr `region=all` pozwala pobrać wszystkie dostępne węzły:

```text
GET /api/v1/nodes?region=all
```

## Uznania
Projekt powstał na bazie [map.meshcore.dev](https://github.com/recrof/map.meshcore.dev) autorstwa [recrof](https://github.com/recrof) (Rastislav Vysoký).

## Licencja
Projekt jest dostępny na licencji MIT. Szczegóły znajdują się w pliku [LICENSE](LICENSE).
