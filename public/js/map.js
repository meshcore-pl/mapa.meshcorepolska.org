/* global L */
import { unpack } from '../vendor/msgpackr/msgpackr.js';
import { toCanvas as qrToCanvas } from '../vendor/qrcode/qrcode.js';
import * as ntools from './node-utils.js';
import { initModal } from './modal.js';
import { initLegendPanel } from './legend.js';
import { initStatsModal } from './stats.js';
import { showToast, updateToast } from './toast.js';

const apiUrl = region => `/api/v1/nodes?region=${region}`;

const uint8ArrayToHex = uint8arr => {
	const hexOctets = new Array(uint8arr.length);

	for (let i = 0; i < uint8arr.length; ++i) {
		hexOctets[i] = ntools.byteToHex[uint8arr[i]];
	}

	return hexOctets.join('');
};

let presets = [];

const nodeKeys = {
	pk: {
		key: 'public_key',
		convert: val => uint8ArrayToHex(val),
	},
	t: {
		key: 'type',
	},
	n: {
		key: 'adv_name',
	},
	la: {
		key: 'last_advert',
	},
	id: {
		key: 'inserted_date',
	},
	ud: {
		key: 'updated_date',
	},
	p: {
		key: 'params',
	},
	l: {
		key: 'link',
	},
	s: {
		key: 'source',
	},
};

const types = {
	'1': 'Klient',
	'2': 'Repeater',
	'3': 'Serwer pokoju',
	'4': 'Czujnik',
};

const updateStatusDesc = {
	'none': 'Dodano ręcznie',
	'recent': 'Zaktualizowano niedawno',
	'stale': 'Zaktualizowano jakiś czas temu',
	'old': 'Nie aktualizowano',
	'extinct': 'Zostanie wkrótce usunięty',
};

const radioParamDesc = {
	'bw': {
		label: 'Szerokość pasma',
		unit: 'kHz',
		short: '',
	},
	'freq': {
		label: 'Częstotliwość',
		unit: 'MHz',
		short: '',
	},
	'sf': {
		label: 'Współczynnik rozproszenia',
		unit: '',
		short: 'SF',
	},
	'cr': {
		label: 'Współczynnik kodowania',
		unit: '',
		short: 'CR',
	},
};

const statusBadgeClass = {
	'none': 'badge-status-none',
	'recent': 'badge-status-recent',
	'stale': 'badge-status-stale',
	'old': 'badge-status-old',
	'extinct': 'badge-status-extinct',
};

const columnOrder = ['public_key', 'link', 'inserted_date', 'updated_date', 'coords', 'preset', 'params'];
const paramOrder = ['freq', 'bw', 'sf', 'cr'];

const pluralPl = (count, [one, few, many]) => {
	if (count === 1) return one;

	const lastDigit = count % 10;
	const lastTwoDigits = count % 100;
	if (lastDigit >= 2 && lastDigit <= 4 && !(lastTwoDigits >= 12 && lastTwoDigits <= 14)) return few;

	return many;
};

const timeAgo = msec => {
	const seconds = Math.floor((Date.now() - msec) / 1000);

	const units = [
		{ forms: ['rok', 'lata', 'lat'], limit: 31536000 },
		{ forms: ['miesiąc', 'miesiące', 'miesięcy'], limit: 2592000 },
		{ forms: ['dzień', 'dni', 'dni'], limit: 86400 },
		{ forms: ['godzina', 'godziny', 'godzin'], limit: 3600 },
		{ forms: ['minuta', 'minuty', 'minut'], limit: 60 },
		{ forms: ['sekunda', 'sekundy', 'sekund'], limit: 1 },
	];

	for (const unit of units) {
		const count = Math.floor(seconds / unit.limit);

		if (count >= 1) return `${count} ${pluralPl(count, unit.forms)} temu`;
	}

	return 'przed chwilą';
};

const escapeHtml = html => html.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);

const findPreset = params => presets.find(p =>
	params.sf === p.params.sf &&
	params.freq === p.params.freq &&
	params.bw === p.params.bw
) ?? {};

const withCopyButton = (displayHtml, copyValue, btnTitle, textTitle = '') => `
	<span class="copy-cell">
		<span class="copy-cell-text"${textTitle ? ` title="${textTitle}"` : ''}>${displayHtml}</span>
		<button type="button" class="copy-icon-btn" title="${btnTitle}" data-copy-value="${escapeHtml(copyValue)}">
			<svg class="icon" aria-hidden="true"><use href="/icons/icons.svg#copy"></use></svg>
		</button>
	</span>`;

const columns = {
	coords: {
		label: 'Współrzędne',
		value: val => withCopyButton(
			`<a href="https://google.com/maps/place/${val.replace(' ', '')}" class="coords-link" target="_blank" rel="noopener nofollow">${val}</a>`,
			val,
			'Kopiuj współrzędne'
		),
	},
	inserted_date: {
		label: 'Dodano',
		value: val => {
			const dt = new Date(val);
			return `<time datetime="${val}" title="${ntools.formatDateTime(dt)}">${timeAgo(dt.getTime())}</time>`;
		},
	},
	updated_date: {
		label: 'Zaktualizowano',
		value: val => {
			const dt = new Date(val);
			return `<time datetime="${val}" title="${ntools.formatDateTime(dt)}">${timeAgo(dt.getTime())}</time>`;
		},
	},
	public_key: {
		label: 'Klucz publiczny',
		value: val => withCopyButton(
			escapeHtml(ntools.truncateKey(val)),
			val,
			'Kopiuj klucz publiczny',
			escapeHtml(val)
		),
	},
	preset: {
		label: 'Preset radiowy',
		value: val => {
			const preset = findPreset(val);
			return preset.params?.freq ? preset.name : 'Niestandardowy';
		},
	},
	params: {
		label: 'Parametry radiowe',
		value: val => `<span class="param-chips">${paramOrder.filter(key => key in val).map(key => {
			const paramKey = radioParamDesc[key];
			const text = `${paramKey.short}${val[key]}${paramKey.unit}`;
			return `<span class="param-chip" title="${escapeHtml(paramKey.label)}">${escapeHtml(text)}</span>`;
		}).join('')}</span>`,
	},
	link: {
		label: 'Link Meshcore',
		value: uint8arr => `<button type="button" class="copy-link-btn" data-copy-value="meshcore://${uint8ArrayToHex(uint8arr)}">Skopiuj do schowka</button>`,
	},
};

const svgIconCache = new Map();
const getSvgIcon = (text, color) => {
	const cacheKey = text + '|' + color;
	let icon = svgIconCache.get(cacheKey);
	if (icon) return icon;

	icon = L.divIcon({
		html: `<svg viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg"><ellipse cx="256" cy="256" rx="256" ry="256" fill="${color}"/><text x="256" y="256" dominant-baseline="central" text-anchor="middle" fill="#fff" font-size="150" font-weight="bold" font-family="sans-serif">${text}</text></svg>`,
		className: 'svg-node-icon',
		iconSize: [32, 32],
		iconAnchor: [17, 17],
		popupAnchor: [0, -16],
	});
	svgIconCache.set(cacheKey, icon);
	return icon;
};

const getTable = node => '<table class="node-info"><tbody>' +
	'<tr>' + columnOrder.flatMap(key => node[key] ? [`<td><b>${columns[key].label}</b></td><td>${columns[key].value ? columns[key].value(node[key]) : node[key]}</td>`] : []).join('</tr><tr>') + '</tr>' +
'</tbody></table>';

const getDeletionMailUrl = node => {
	const deletionMailUrl = new URL('mailto:recrof@gmail.com');
	deletionMailUrl.searchParams.append('subject', 'MeshCore Map node deletion request');
	deletionMailUrl.searchParams.append('body', `Please delete my node(s) from MeshCore Map database
MeshCore link(s) or Public key(s):

${node ? node.public_key : ''}

*** IMPORTANT ***
if you have multiple nodes to delete, put them into single email, delimited by newline. public key is enough, you don't need to add name or screenshot of the node.`);

	return deletionMailUrl.toString().replaceAll('+', '%20').replaceAll('\n', '%0A');
};

const discordTimestamp = date => `<t:${Math.floor(date.getTime() / 1000)}:R>`;

const getNodeInfoText = node => {
	const lines = [`# ${node.adv_name}`, ''];

	lines.push(`- **Klucz publiczny:** \`${node.public_key}\``);
	lines.push(`- **Typ:** ${types[node.type]}`);
	if (node.status) lines.push(`- **Aktualność:** ${updateStatusDesc[node.status]}`);
	if (node.link) lines.push(`- **Link Meshcore:** \`meshcore://${uint8ArrayToHex(node.link)}\``);
	lines.push(`- **Dodano:** ${ntools.formatDateTime(node.insertDate)} (${discordTimestamp(node.insertDate)})`);
	if (node.updatedDate) lines.push(`- **Zaktualizowano:** ${ntools.formatDateTime(node.updatedDate)} (${discordTimestamp(node.updatedDate)})`);
	lines.push(`- **Współrzędne:** \`${node.coords}\` ([Mapa](https://google.com/maps/place/${node.coords.replace(' ', '')}))`);

	if (node.params) {
		const preset = findPreset(node.params);
		lines.push(`- **Preset radiowy:** ${preset.params?.freq ? preset.name : 'Niestandardowy'}`);
		lines.push('- **Ustawienia:**');
		for (const key of paramOrder.filter(k => k in node.params)) {
			const paramKey = radioParamDesc[key];
			lines.push(`  - ${paramKey.label}: ${node.params[key]}${paramKey.unit}`);
		}
	}

	return lines.join('\n');
};

const getNodePopupHTML = node => {
	const userActionUrl = encodeURI(localStorage.getItem('userActionUrl') || '');
	const userActionLabel = localStorage.getItem('userActionLabel') || '';
	const userActionAnchor = userActionUrl ? `<a target="_blank" rel="noopener noreferrer" href="https://${userActionUrl}?nodes=${node.public_key}">${userActionLabel}</a>` : '';
	const contactParams = new URLSearchParams({
		name: node.adv_name,
		public_key: node.public_key,
		type: node.type,
	});
	const qrValue = `meshcore://contact/add?${contactParams.toString()}`;
	const statusClass = statusBadgeClass[node.status] || '';
	const shareUrl = `${location.origin}${location.pathname}?node=${node.public_key}`;

	return `
		<div class="node-header">
			<div class="node-qr" data-qr-value="${escapeHtml(qrValue)}"></div>
			<div class="node-header-info">
				<div class="node-title">
					<span class="node-title-text">${escapeHtml(node.adv_name)}</span>
					<button type="button" class="copy-icon-btn" title="Kopiuj nazwę" data-copy-value="${escapeHtml(node.adv_name)}">
						<svg class="icon" aria-hidden="true"><use href="/icons/icons.svg#copy"></use></svg>
					</button>
				</div>
				<div class="node-badges">
					<span class="badge">${types[node.type]}</span>
					${node.status ? `<span class="badge ${statusClass}"><span class="badge-dot"></span>${updateStatusDesc[node.status]}</span>` : ''}
				</div>
			</div>
		</div>
		${getTable(node)}
		<div class="user-actions">
			<div class="user-actions-left">
				<button type="button" class="copy-link-btn" data-copy-value="${escapeHtml(shareUrl)}">Udostępnij</button>
				<button type="button" class="copy-link-btn" data-copy-value="${escapeHtml(getNodeInfoText(node))}">Skopiuj informacje</button>
			</div>
			<div class="user-actions-right">
				<a href="${getDeletionMailUrl(node)}" target="_blank">Zgłoś usunięcie węzła</a>
				${userActionAnchor}
			</div>
		</div>`;
};

const getPresets = async signal => {
	if (presets.length) return presets;

	const res = await fetch('https://api.meshcore.nz/api/v1/config', { signal });
	const presetsApi = (await res.json()).config.suggested_radio_settings.entries;

	presets = presetsApi.map(p => ({
		name: p.title,
		desc: p.description,
		params: {
			freq: Number(p.frequency),
			bw: Number(p.bandwidth),
			sf: Number(p.spreading_factor),
			cr: Number(p.coding_rate),
		},
	}));

	presets.unshift({
		name: 'Wszystkie presety',
		params: {},
	});

	return presets;
};

const baseMaps = {
	'CartoDB Dark': L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
		maxZoom: 20,
		subdomains: 'abcd',
		attribution: 'Kafelki: &copy; <a href="https://carto.com/attributions">CARTO</a>',
	}),
	'OpenStreetMap': L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
		maxZoom: 19,
		attribution: 'Kafelki: &copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
	}),
	'Esri Satellite': L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
		maxZoom: 18,
		attribution: 'Kafelki: &copy; Esri',
	}),
	'OpenTopoMap': L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
		maxZoom: 17,
		subdomains: 'abc',
		attribution: 'Kafelki: &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)',
	}),
};

const baseMapOrder = ['CartoDB Dark', 'OpenStreetMap', 'Esri Satellite', 'OpenTopoMap'];

const storedBaseMap = localStorage.getItem('baseMapSelected');
const baseMapSelected = Object.hasOwn(baseMaps, storedBaseMap) ? storedBaseMap : 'CartoDB Dark';

const urlParams = Object.fromEntries(new URLSearchParams(location.search));
let initialView = { lat: 52.2893, lon: 19.1162, zoom: 7 };
if (Number(urlParams.lat) && Number(urlParams.lon) && Number(urlParams.zoom)) {
	initialView = urlParams;
}

const map = window.leafletMap = L.map('map', {
	minZoom: 2,
	maxBounds: [
		[-90, -180],
		[90, 200],
	],
	zoomControl: false,
}).setView([initialView.lat, initialView.lon], initialView.zoom);

map.attributionControl.setPrefix('<a href="https://leafletjs.com" title="Biblioteka JS do map interaktywnych">Leaflet</a>');
map.attributionControl.setPosition('bottomleft');

map.addLayer(baseMaps[baseMapSelected]);

map.on('popupopen', e => {
	requestAnimationFrame(() => {
		const qrEl = e.popup.getElement()?.querySelector('.node-qr');
		if (!qrEl || !qrEl.isConnected) return;

		qrEl.innerHTML = '';
		const canvas = document.createElement('canvas');
		qrEl.appendChild(canvas);
		qrToCanvas(canvas, qrEl.dataset.qrValue, {
			width: 256,
			margin: 1,
			color: { dark: '#000', light: '#fff' },
			errorCorrectionLevel: 'M',
		}).catch(err => console.error('Nie udało się wygenerować kodu QR:', err));
	});
});

const setBaseMap = name => {
	for (const [key, layer] of Object.entries(baseMaps)) {
		if (key === name) {
			if (!map.hasLayer(layer)) map.addLayer(layer);
		} else if (map.hasLayer(layer)) {
			map.removeLayer(layer);
		}
	}
	localStorage.setItem('baseMapSelected', name);
};

const nodeTypeIconNames = { 1: 'client', 2: 'repeater', 3: 'room-server', 4: 'sensor' };

const icons = Object.fromEntries(['none', 'recent', 'stale', 'old', 'extinct'].map(color => [color,
	Object.fromEntries([2, 3, 4].map(id => [id, L.divIcon({
		html: `<svg width="32" height="32"><use href="/icons/node-types.svg#${nodeTypeIconNames[id]}"></use></svg>`,
		className: `svg-node-icon update-${color}`,
		iconSize: [32, 32],
		iconAnchor: [17, 17],
		popupAnchor: [0, -16],
	})])),
]));

const loadingOverlay = document.getElementById('loading-overlay');
const loadingStatus = document.getElementById('loading-status');
const loadingProgressBar = document.getElementById('loading-progress-bar');
const loadingMeta = document.getElementById('loading-meta');
const loadingCancelBtn = document.getElementById('loading-cancel-btn');
const regionWarningOverlay = document.getElementById('region-warning-overlay');
const regionWarningConfirmBtn = document.getElementById('region-warning-confirm');
const regionWarningCancelBtn = document.getElementById('region-warning-cancel');
const regionWarningSizeEl = document.getElementById('region-warning-size');
const statsCounts = document.getElementById('stats-counts');
const regionToggle = document.getElementById('region-toggle');
const regionToggleLabel = document.getElementById('region-toggle-label');
const basemapToggle = document.getElementById('basemap-toggle');
const basemapMenu = document.getElementById('basemap-menu');
const settingsModal = initModal('settings-toggle', 'settings-overlay');
const legendPanelUi = initLegendPanel();
const searchInline = document.getElementById('search-form');
const searchInput = document.getElementById('search-input');
const searchResultsEl = document.getElementById('search-results');
const filterToggle = document.getElementById('filter-toggle');
const filterActiveDot = document.getElementById('filter-active-dot');
const filterMenu = document.getElementById('node-filter');
const fromDateInput = document.getElementById('from-date');
const fromInsertDateInput = document.getElementById('from-insert-date');
const clusteringZoomInput = document.getElementById('clustering-zoom');
const freqFilterGroup = document.getElementById('freq-filter-group');
const freqFilterList = document.getElementById('freq-filter-list');
const clearFiltersBtn = document.getElementById('clear-filters-btn');
const nodeTypeCheckboxes = [...document.querySelectorAll('.node-type-checkbox')];
const legendUpdatedAtEl = document.getElementById('legend-updated-at');

const storedRegion = localStorage.getItem('regionSelected');

const state = {
	search: '',
	region: storedRegion === 'all' ? 'all' : 'pl',
	nodeFilter: ['1', '2', '3', '4'],
	freqFilter: [],
	availableFreqs: [],
	fromDate: '',
	fromInsertDate: '',
	clusteringZoom: 11,
	nodes: [],
	nodesByType: {},
	filteredNodes: [],
};

const statsModal = initStatsModal({
	getNodes: () => state.nodes,
	getRepeaters: () => state.nodesByType[2] || [],
	escapeHtml,
	timeAgo,
	onFocusNode: node => showNode(node),
});

for (const a of [settingsModal, legendPanelUi, statsModal]) {
	for (const b of [settingsModal, legendPanelUi, statsModal]) {
		if (a !== b) a.toggle.addEventListener('click', () => b.close());
	}
}

const markerToNode = new WeakMap();

let markerClusterGroup = L.markerClusterGroup({
	disableClusteringAtZoom: state.clusteringZoom,
	chunkedLoading: true,
});

const ensurePopup = marker => {
	if (marker._popupBound) return;

	const node = markerToNode.get(marker);
	if (node) {
		marker.bindPopup(L.popup({ minWidth: 410, maxWidth: 410, content: () => getNodePopupHTML(node) }));
		marker._popupBound = true;
	}
};

const attachClusterClickHandler = group => {
	group.on('click', e => {
		const marker = e.layer;
		if (marker) {
			ensurePopup(marker);
			marker.openPopup();
		}
	});
};

attachClusterClickHandler(markerClusterGroup);

const LOADING_PHASES = {
	connect: { from: 0, to: 5 },
	download: { from: 5, to: 55 },
	unpack: { from: 55, to: 60 },
	process: { from: 60, to: 90 },
	presets: { from: 90, to: 100 },
};

const setLoading = loading => {
	loadingOverlay.hidden = !loading;
	if (loading) {
		loadingStatus.textContent = '';
		loadingProgressBar.style.width = '0%';
		loadingMeta.textContent = '';
	}
};

const setLoadingStatus = text => {
	loadingStatus.textContent = text;
};

const setLoadingProgress = (phase, fraction = 1) => {
	const { from, to } = LOADING_PHASES[phase];
	const pct = from + (to - from) * Math.min(1, Math.max(0, fraction));
	loadingProgressBar.style.width = `${pct}%`;
};

const renderDownloadMeta = (receivedBytes, totalBytes, elapsedSec) => {
	const sizeText = totalBytes ? `${ntools.formatBytes(receivedBytes)} / ${ntools.formatBytes(totalBytes)}` : ntools.formatBytes(receivedBytes);
	const speed = elapsedSec > 0 ? receivedBytes / elapsedSec : 0;
	loadingMeta.textContent = `${sizeText} · ${ntools.formatBytes(speed)}/s`;
};

const positionDropdown = (el, anchor = searchInline, { fullWidthOnMobile = true } = {}) => {
	const rect = anchor.getBoundingClientRect();
	el.style.top = `${rect.bottom + 10}px`;

	if (fullWidthOnMobile && window.innerWidth <= 800) {
		el.style.left = '14px';
		el.style.right = '14px';
		el.style.width = 'auto';
	}
	else {
		el.style.left = 'auto';
		el.style.right = `${window.innerWidth - rect.right}px`;
		el.style.width = '';
	}
};

const refreshMap = ({ clusteringZoom = 0 } = {}) => {
	markerClusterGroup.clearLayers();
	const nodes = state.filteredNodes.length > 0 ? state.filteredNodes : state.nodes;

	map.removeLayer(markerClusterGroup);

	if (clusteringZoom) {
		markerClusterGroup = L.markerClusterGroup({
			disableClusteringAtZoom: clusteringZoom,
			chunkedLoading: true,
		});
		attachClusterClickHandler(markerClusterGroup);
	}

	const markers = new Array(nodes.length);
	for (let i = 0; i < nodes.length; i++) {
		markers[i] = nodes[i].marker;
	}
	markerClusterGroup.addLayers(markers);

	map.addLayer(markerClusterGroup);
};

function showNode(node) {
	ensurePopup(node.marker);

	const zoom = 19;
	const targetLatLng = node.marker.getLatLng();
	const targetPoint = map.project(targetLatLng, zoom).subtract([0, 140]);
	map.setView(map.unproject(targetPoint, zoom), zoom, { animate: false });

	node.marker.openPopup();
	state.search = '';
	searchInput.value = '';
	renderSearchResults();
}

const highlightString = (source, toHighlight) => {
	const escapedSource = escapeHtml(source);
	const matchIndex = source.toLowerCase().indexOf(toHighlight.toLowerCase());
	const highlight = matchIndex >= 0 ? source.substring(matchIndex, matchIndex + toHighlight.length) : toHighlight;
	return escapedSource.replace(escapeHtml(highlight), `<b>${escapeHtml(highlight)}</b>`);
};

const syncUrlParams = () => {
	const params = {
		lat: map.getCenter().lat.toFixed(4),
		lon: map.getCenter().lng.toFixed(4),
		zoom: map.getZoom(),
		nodes: state.nodeFilter.join(','),
		freq: state.freqFilter.join(','),
		date: state.fromDate,
		dateInsert: state.fromInsertDate,
		cluster: state.clusteringZoom,
	};

	history.replaceState({}, '', `/?${new URLSearchParams(params)}`);
};

const updateRegionToggleUI = () => {
	const showingAll = state.region === 'all';
	regionToggle.classList.toggle('active', showingAll);
	regionToggle.title = showingAll ? 'Pokaż tylko polskie węzły' : 'Pokaż wszystkie węzły na świecie';
	regionToggleLabel.textContent = showingAll ? 'Wszystkie węzły' : 'Tylko Polska';
};

const updateFiltersActiveUI = () => {
	const active = state.filteredNodes.length > 0 && state.nodes.length !== state.filteredNodes.length;
	filterToggle.classList.toggle('active', active);
	filterActiveDot.hidden = !active;
	clearFiltersBtn.hidden = !active;
};

const renderStats = () => {
	const nodes = state.nodes;
	if (!nodes.length) {
		statsCounts.innerHTML = '';
		return;
	}

	const byType = state.nodesByType;

	statsCounts.innerHTML = `
		<span class="pointer-help" title="Łączna liczba wszystkich węzłów">razem: <b>${nodes.length}</b></span>&nbsp;|
		<svg class="icon pointer-help"><title>Łączna liczba klientów</title><use href="/icons/icons.svg#user"></use></svg><b>${(byType[1] || []).length}</b>&nbsp;|
		<svg class="icon icon-filled pointer-help"><title>Łączna liczba repeaterów</title><use href="/icons/node-types.svg#repeater-plain"></use></svg><b>${(byType[2] || []).length}</b>&nbsp;|
		<svg class="icon pointer-help"><title>Łączna liczba serwerów pokoju</title><use href="/icons/icons.svg#message"></use></svg><b>${(byType[3] || []).length}</b>`;

	statsModal.render();
};

let searchResults = [];
let searchActiveIndex = 0;

const setSearchActiveIndex = index => {
	if (!searchResults.length) return;
	searchActiveIndex = Math.max(0, Math.min(index, searchResults.length - 1));
	[...searchResultsEl.children].forEach((li, i) => li.classList.toggle('active', i === searchActiveIndex));
	searchResultsEl.children[searchActiveIndex]?.scrollIntoView({ block: 'nearest' });
};

function renderSearchResults() {
	if (!state.search) {
		searchResultsEl.hidden = true;
		searchResultsEl.innerHTML = '';
		searchResults = [];
		return;
	}

	const nodes = state.filteredNodes.length > 0 ? state.filteredNodes : state.nodes;
	searchResults = nodes.filter(
		node => node.adv_name.toLowerCase().includes(state.search.toLowerCase()) || node.public_key.startsWith(state.search)
	).toSorted(
		(a, b) => a.adv_name.localeCompare(b.adv_name)
	).slice(0, 20);

	searchResultsEl.hidden = searchResults.length === 0;
	if (!searchResultsEl.hidden) positionDropdown(searchResultsEl);
	searchResultsEl.innerHTML = searchResults.map(node => `
		<li>
			<svg width="22" height="22"><use href="/icons/node-types.svg#${nodeTypeIconNames[node.type]}-plain"></use></svg>
			<div class="search-text">
				<h6>${highlightString(node.adv_name, state.search)}</h6>
				<div class="search-pkey">${highlightString(ntools.truncateKey(node.public_key), state.search)}</div>
			</div>
		</li>
	`).join('');

	[...searchResultsEl.children].forEach((li, index) => {
		li.addEventListener('click', () => showNode(searchResults[index]));
		li.addEventListener('mouseenter', () => setSearchActiveIndex(index));
	});

	setSearchActiveIndex(0);
}

const runFilterPass = () => {
	const fromDate = new Date(state.fromDate);
	const fromInsertDate = new Date(state.fromInsertDate);
	const byType = state.nodesByType;
	const hasFreqFilter = state.freqFilter.length > 0;
	const freqSet = hasFreqFilter ? new Set(state.freqFilter) : null;

	const result = [];
	for (const type of state.nodeFilter) {
		const typeNodes = byType[type];
		if (!typeNodes) continue;

		for (let i = 0; i < typeNodes.length; i++) {
			const node = typeNodes[i];
			if (node.updatedDate ? node.updatedDate <= fromDate : node.insertDate <= fromDate) continue;
			if (node.insertDate <= fromInsertDate) continue;
			if (hasFreqFilter && !(node.params?.freq && freqSet.has(Math.floor(node.params.freq)))) continue;
			result.push(node);
		}
	}

	state.filteredNodes = result;
	refreshMap();
	syncUrlParams();
	updateFiltersActiveUI();
	renderSearchResults();
};

let filterToast = null;

const applyFilters = ({ silent = false } = {}) => {
	if (silent) {
		runFilterPass();
		return;
	}

	filterToast = filterToast?.isConnected
		? updateToast(filterToast, 'Aktualizowanie danych...', { duration: 0, status: 'loading' })
		: showToast('Aktualizowanie danych...', { duration: 0, status: 'loading' });

	requestAnimationFrame(() => requestAnimationFrame(() => {
		try {
			runFilterPass();
			updateToast(filterToast, 'Dane zaktualizowane', { duration: 1000, status: 'success' });
		} catch (err) {
			console.error('Nie udało się zaktualizować danych:', err);
			updateToast(filterToast, 'Nie udało się zaktualizować danych', { status: 'error' });
		}
	}));
};

const onFreqFilterChange = () => {
	state.freqFilter = [...freqFilterList.querySelectorAll('.freq-checkbox:checked')].map(cb => Number(cb.value));
	applyFilters();
};

const renderFreqFilters = () => {
	freqFilterGroup.hidden = state.availableFreqs.length === 0;
	freqFilterList.innerHTML = state.availableFreqs.map(freq => `
		<label class="checkbox-label">
			<input type="checkbox" class="freq-checkbox" value="${freq}" ${state.freqFilter.includes(freq) ? 'checked' : ''}>
			${freq} MHz
		</label>
	`).join('');

	freqFilterList.querySelectorAll('.freq-checkbox').forEach(checkbox => {
		checkbox.addEventListener('change', onFreqFilterChange);
	});
};

const clearFilters = () => {
	state.nodeFilter = ['1', '2', '3', '4'];
	state.freqFilter = [];
	state.fromDate = '2025-03-01';
	state.fromInsertDate = '2025-03-01';
	state.clusteringZoom = 11;

	nodeTypeCheckboxes.forEach(cb => { cb.checked = true; });
	fromDateInput.value = state.fromDate;
	fromInsertDateInput.value = state.fromInsertDate;
	clusteringZoomInput.value = state.clusteringZoom;
	renderFreqFilters();

	applyFilters();
};

const getDaysEpochMsec = days => days * 24 * 60 * 60 * 1000;

const inflateNode = node => {
	for (const key of Object.keys(node)) {
		if (!nodeKeys[key]) continue;
		const convertFn = nodeKeys[key].convert;
		node[nodeKeys[key].key] = typeof convertFn === 'function' ? convertFn(node[key]) : node[key];

		delete node[key];
	}
};

const nodesCache = {};
let currentDownloadAbort = null;

const renderLegendUpdatedAt = dataUpdatedAt => {
	legendUpdatedAtEl.textContent = dataUpdatedAt ? ntools.formatTime(new Date(dataUpdatedAt)) : '-';
};

const applyDownloadedNodes = cached => {
	state.nodesByType = cached.byType;
	state.nodes = cached.nodes;
	state.availableFreqs = cached.availableFreqs;
	renderStats();
	renderFreqFilters();
	renderLegendUpdatedAt(cached.dataUpdatedAt);
};

const downloadNodes = async region => {
	currentDownloadAbort?.abort();

	if (nodesCache[region]) {
		applyDownloadedNodes(nodesCache[region]);
		return;
	}

	const now = Date.now();
	const extinctThreshold = now - getDaysEpochMsec(20);
	const oldThreshold = now - getDaysEpochMsec(10);
	const staleThreshold = now - getDaysEpochMsec(5);

	const getNodeUpdateStatus = node => {
		if (node.source[0] !== 'u') return 'none';
		const updateEpoch = new Date(node.updated_date).getTime();
		if (updateEpoch < extinctThreshold) return 'extinct';
		if (updateEpoch < oldThreshold) return 'old';
		if (updateEpoch < staleThreshold) return 'stale';
		return 'recent';
	};

	const abortController = new AbortController();
	currentDownloadAbort = abortController;

	try {
		setLoading(true);

		setLoadingStatus('Łączenie z serwerem...');
		const nodesReq = await fetch(apiUrl(region), { signal: abortController.signal });

		if (!nodesReq.ok) {
			let message = `Serwer zwrócił błąd ${nodesReq.status}`;
			try {
				const body = await nodesReq.json();
				if (body?.message) message = body.message;
			} catch { /* response body wasn't JSON, keep the generic message */ }

			const apiErr = new Error(message);
			apiErr.isApiError = true;
			throw apiErr;
		}

		const dataUpdatedAt = nodesReq.headers.get('X-Data-Updated');
		const totalBytes = Number(nodesReq.headers.get('Content-Length')) || 0;
		setLoadingProgress('connect');

		setLoadingStatus('Pobieranie danych...');
		const reader = nodesReq.body.getReader();
		const chunks = [];
		let receivedBytes = 0;
		const startTime = performance.now();

		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;

			chunks.push(value);
			receivedBytes += value.length;
			setLoadingProgress('download', totalBytes ? receivedBytes / totalBytes : 0);
			renderDownloadMeta(receivedBytes, totalBytes, (performance.now() - startTime) / 1000);
		}

		setLoadingProgress('download');
		loadingMeta.textContent = `${ntools.formatBytes(receivedBytes)} / ${ntools.formatBytes(totalBytes)} · Ukończono`;

		const nodesBuffer = new Uint8Array(receivedBytes);
		let writeOffset = 0;
		for (const chunk of chunks) {
			nodesBuffer.set(chunk, writeOffset);
			writeOffset += chunk.length;
		}

		setLoadingStatus('Rozpakowywanie danych...');
		const nodes = unpack(nodesBuffer);
		setLoadingProgress('unpack');

		const presetsPromise = getPresets(abortController.signal);

		const byType = {};
		const freqSet = new Set();
		const CHUNK_SIZE = 2000;

		for (let offset = 0; offset < nodes.length; offset += CHUNK_SIZE) {
			const end = Math.min(offset + CHUNK_SIZE, nodes.length);

			if (abortController.signal.aborted) throw new DOMException('Anulowano przez użytkownika', 'AbortError');

			setLoadingStatus(`Przetwarzanie węzłów... (${end} / ${nodes.length})`);
			setLoadingProgress('process', end / nodes.length);
			if (offset > 0) await new Promise(r => setTimeout(r, 0));

			for (let i = offset; i < end; i++) {
				const node = nodes[i];
				inflateNode(node);
				const updateStatus = getNodeUpdateStatus(node);

				let icon = icons[updateStatus][node.type.toString()];

				(byType[node.type] ??= []).push(node);

				if (node.type === 1) {
					const label = ntools.getNameIconLabel(node.adv_name);
					const color = ntools.getColourForName(node.adv_name);
					icon = getSvgIcon(label, color);
				}

				const marker = node.marker = L.marker([node.lat, node.lon], { icon, title: node.adv_name });

				node.status = updateStatus;
				node.preset = node.params;
				node.coords = `${node.lat.toFixed(6)}, ${node.lon.toFixed(6)}`;
				node.lastAdvertDate = new Date(node.last_advert);
				node.insertDate = new Date(node.inserted_date);
				node.updatedDate = node.updated_date && new Date(node.updated_date);
				markerToNode.set(marker, node);

				if (node.params?.freq) freqSet.add(Math.floor(node.params.freq));
			}
		}

		if (abortController.signal.aborted) throw new DOMException('Anulowano przez użytkownika', 'AbortError');

		setLoadingStatus('Uzyskiwanie presetów radiowych...');
		setLoadingProgress('presets', 0);
		try {
			await presetsPromise;
		} catch (err) {
			if (err.name === 'AbortError') throw err;
			console.error('Nie udało się pobrać presetów radiowych:', err);
		}
		setLoadingProgress('presets');

		setLoadingStatus('Gotowe.');

		nodesCache[region] = { nodes, byType, availableFreqs: [...freqSet].sort((a, b) => a - b), dataUpdatedAt };
		applyDownloadedNodes(nodesCache[region]);
	} catch (err) {
		if (err.name !== 'AbortError') {
			const message = err.isApiError ? err.message : 'Wystąpił nieoczekiwany błąd podczas wczytywania danych. Spróbuj odświeżyć stronę.';
			showToast(message, { status: 'error', duration: 6000 });
			console.error(err);
		}
	} finally {
		if (currentDownloadAbort === abortController) {
			currentDownloadAbort = null;
			setLoading(false);
		}
	}
};

const setRegion = async region => {
	if (region === state.region) return;

	const cached = Boolean(nodesCache[region]);
	state.region = region;
	localStorage.setItem('regionSelected', region);
	updateRegionToggleUI();
	await downloadNodes(region);
	applyFilters({ silent: !cached });
};

searchInline.addEventListener('submit', e => e.preventDefault());

searchInput.addEventListener('focus', () => {
	if (localStorage.getItem('shiftSearchHintShown')) return;
	localStorage.setItem('shiftSearchHintShown', '1');
	showToast('Wskazówka: wciśnij Shift, aby przejść od razu do wyszukiwania', { duration: 4000, status: 'info' });
}, { once: true });

searchInput.addEventListener('input', () => {
	state.search = searchInput.value;
	renderSearchResults();
});

searchInput.addEventListener('keydown', e => {
	if (searchResultsEl.hidden || !searchResults.length) return;

	if (e.key === 'ArrowDown') {
		e.preventDefault();
		setSearchActiveIndex(searchActiveIndex + 1);
	} else if (e.key === 'ArrowUp') {
		e.preventDefault();
		setSearchActiveIndex(searchActiveIndex - 1);
	} else if (e.key === 'Enter') {
		e.preventDefault();
		showNode(searchResults[searchActiveIndex]);
	} else if (e.key === 'Escape') {
		searchResultsEl.hidden = true;
	}
});

document.addEventListener('keydown', e => {
	if (e.key !== 'Shift') return;

	const active = document.activeElement;
	const isTyping = active && (['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName) || active.isContentEditable);
	if (isTyping) return;

	searchInput.focus();
});

filterToggle.addEventListener('click', () => {
	const willShow = filterMenu.hidden;
	filterMenu.hidden = !filterMenu.hidden;
	if (willShow) positionDropdown(filterMenu);
});

nodeTypeCheckboxes.forEach(checkbox => {
	checkbox.addEventListener('change', () => {
		state.nodeFilter = nodeTypeCheckboxes.filter(cb => cb.checked).map(cb => cb.value);
		applyFilters();
	});
});

fromDateInput.addEventListener('change', () => {
	state.fromDate = fromDateInput.value;
	applyFilters();
});

fromInsertDateInput.addEventListener('change', () => {
	state.fromInsertDate = fromInsertDateInput.value;
	applyFilters();
});

clusteringZoomInput.addEventListener('input', () => {
	state.clusteringZoom = Number(clusteringZoomInput.value);
	refreshMap({ clusteringZoom: state.clusteringZoom });
	syncUrlParams();
});

clearFiltersBtn.addEventListener('click', clearFilters);

loadingCancelBtn.addEventListener('click', () => currentDownloadAbort?.abort());

const confirmRegionWarning = () => new Promise(resolve => {
	function cleanup(confirmed) {
		regionWarningOverlay.hidden = true;
		regionWarningConfirmBtn.removeEventListener('click', onConfirm);
		regionWarningCancelBtn.removeEventListener('click', onCancel);
		regionWarningOverlay.removeEventListener('click', onOverlayClick);
		document.removeEventListener('keydown', onKeydown);
		resolve(confirmed);
	}

	function onConfirm() { cleanup(true); }
	function onCancel() { cleanup(false); }
	function onOverlayClick(e) { if (e.target === regionWarningOverlay) cleanup(false); }
	function onKeydown(e) { if (e.key === 'Escape') cleanup(false); }

	regionWarningConfirmBtn.addEventListener('click', onConfirm);
	regionWarningCancelBtn.addEventListener('click', onCancel);
	regionWarningOverlay.addEventListener('click', onOverlayClick);
	document.addEventListener('keydown', onKeydown);

	regionWarningOverlay.hidden = false;
	regionWarningCancelBtn.focus();
});

const getRegionDataSize = async region => {
	try {
		const res = await fetch(apiUrl(region), { method: 'HEAD' });
		return Number(res.headers.get('Content-Length')) || 0;
	} catch {
		return 0;
	}
};

regionToggle.addEventListener('click', async () => {
	const targetRegion = state.region === 'all' ? 'pl' : 'all';

	if (targetRegion === 'all' && !nodesCache.all && !localStorage.getItem('regionWarningAcknowledged')) {
		const size = await getRegionDataSize('all');
		regionWarningSizeEl.textContent = size ? `około ${ntools.formatBytes(size)}` : 'nieznany rozmiar';

		const confirmed = await confirmRegionWarning();
		if (!confirmed) return;

		localStorage.setItem('regionWarningAcknowledged', '1');
	}

	void setRegion(targetRegion);
});

let currentBaseMap = baseMapSelected;

const renderBaseMapToggle = () => {
	basemapToggle.classList.toggle('active', currentBaseMap !== baseMapOrder[0]);
	[...basemapMenu.children].forEach(li => li.classList.toggle('active', li.dataset.basemap === currentBaseMap));
};

const renderBasemapMenu = () => {
	basemapMenu.innerHTML = baseMapOrder.map(name => `<li data-basemap="${name}">${name}</li>`).join('');
};

renderBasemapMenu();
renderBaseMapToggle();

basemapMenu.addEventListener('click', e => {
	const li = e.target.closest('li');
	if (!li) return;

	currentBaseMap = li.dataset.basemap;
	setBaseMap(currentBaseMap);
	renderBaseMapToggle();
	basemapMenu.hidden = true;
});

basemapToggle.addEventListener('click', () => {
	const willShow = basemapMenu.hidden;
	basemapMenu.hidden = !basemapMenu.hidden;
	if (willShow) positionDropdown(basemapMenu, basemapToggle, { fullWidthOnMobile: false });
});

document.addEventListener('click', e => {
	const copyBtn = e.target.closest('.copy-link-btn, .copy-icon-btn');
	if (copyBtn) void navigator.clipboard.writeText(copyBtn.dataset.copyValue).then(() => showToast('Skopiowano do schowka'));
});

document.addEventListener('click', e => {
	if (!filterMenu.hidden && !filterMenu.contains(e.target) && !filterToggle.contains(e.target)) filterMenu.hidden = true;
	if (!searchResultsEl.hidden && !searchResultsEl.contains(e.target) && !searchInline.contains(e.target)) searchResultsEl.hidden = true;
	if (!basemapMenu.hidden && !basemapMenu.contains(e.target) && !basemapToggle.contains(e.target)) basemapMenu.hidden = true;
});

window.addEventListener('resize', () => {
	if (!filterMenu.hidden) positionDropdown(filterMenu);
	if (!searchResultsEl.hidden) positionDropdown(searchResultsEl);
	if (!basemapMenu.hidden) positionDropdown(basemapMenu, basemapToggle, { fullWidthOnMobile: false });
});

map.on('moveend', syncUrlParams);

if (urlParams.nodes) {
	state.nodeFilter = urlParams.nodes.split(',');
	nodeTypeCheckboxes.forEach(cb => { cb.checked = state.nodeFilter.includes(cb.value); });
}
if (urlParams.date) {
	state.fromDate = urlParams.date;
	fromDateInput.value = state.fromDate;
}
if (urlParams.dateInsert) {
	state.fromInsertDate = urlParams.dateInsert;
	fromInsertDateInput.value = state.fromInsertDate;
}
if (urlParams.cluster) {
	state.clusteringZoom = Number(urlParams.cluster);
	clusteringZoomInput.value = state.clusteringZoom;
}

updateRegionToggleUI();

downloadNodes(state.region).then(() => {
	if (urlParams.freq) {
		state.freqFilter = urlParams.freq.split(',').map(Number);
		renderFreqFilters();
	}
	applyFilters({ silent: true });

	if (urlParams.node) {
		const node = state.nodes.find(n => n.public_key === urlParams.node);
		if (node) showNode(node);
	}
});

window.refreshMap = refreshMap;
