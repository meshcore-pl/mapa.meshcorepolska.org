# Polska Mapa MeshCore 🗺️

Interaktywna mapa węzłów sieci MeshCore w Polsce i na świecie. Projekt składa się z lekkiego frontendu mapowego oraz backendu Node.js, który pobiera dane z publicznego API MeshCore i przechowuje je w pamięci podręcznej Redis.

## Funkcje
- Wyświetlanie węzłów na interaktywnej mapie
- Grupowanie znaczników przy użyciu klastrów
- Wyszukiwanie i filtrowanie węzłów
- Cykliczne odświeżanie danych co 5 minut
- Binarne przesyłanie danych w formacie MessagePack

## Nowości / zmiany
- Przetłumaczono wszystko na nasz język
- Przełączanie pomiędzy węzłami z Polski i całego świata
- Domyślnie od razu przy wejściu na stronę pojawi się Polska
- Nowoczesny kod HTML5, CSS3 (vanilla)
- Podbito zależności do najnowszych wersji
- Zoptymalizowano transfer, dzięki czemu strona będzie się szybciej wczytywać

## Wymagania
- Node.js >=20.12.0
- Redis
- Dostęp do internetu w celu pobierania danych źródłowych

## Instalacja
```bash
git clone https://github.com/meshcore-pl/map.git
cd mapa.meshcorepolska.org
npm install
cp .env.example .env
```

Następnie uzupełnij dane dostępowe do Redis w utworzonym pliku `.env`.

Uruchom serwer poleceniem:
```bash
node index.js
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

## Użyte biblioteki
- [Leaflet](https://github.com/Leaflet/Leaflet)
- [Leaflet.markercluster](https://github.com/Leaflet/Leaflet.markercluster)
- [msgpackr](https://github.com/kriszyp/msgpackr)
- [Express](https://github.com/expressjs/express)
- [Redis](https://github.com/redis/node-redis)
- [Material Icons](https://fonts.google.com/icons)

## Uznania
Projekt powstał na bazie [map.meshcore.dev](https://github.com/recrof/map.meshcore.dev) autorstwa [recrof](https://github.com/recrof) (Rastislav Vysoký). Kod został znacząco przebudowany i jest udostępniany na licencji MIT.

## Licencja
Projekt jest dostępny na licencji MIT. Szczegóły znajdują się w pliku [LICENSE](LICENSE).