/* global L, QRCode */
import { unpack } from '../vendor/msgpackr/msgpackr.js';
import * as ntools from './node-utils.js';
import { initModal } from './modal.js';
import { initLegendPanel } from './legend.js';
import { initStatsModal } from './stats.js';
import { showToast } from './toast.js';

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
	},
	'freq': {
		label: 'Częstotliwość',
		unit: 'MHz',
	},
	'sf': {
		label: 'Współczynnik rozproszenia',
		unit: '',
	},
	'cr': {
		label: 'Współczynnik kodowania',
		unit: '',
	},
};

const columnOrder = ['adv_name', 'public_key', 'type', 'status', 'link', 'inserted_date', 'updated_date', 'coords', 'preset', 'params'];

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
	adv_name: {
		label: 'Nazwa',
		value: val => withCopyButton(escapeHtml(val), val, 'Kopiuj nazwę'),
	},
	status: {
		label: 'Aktualność',
		value: val => updateStatusDesc[val],
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
	type: {
		label: 'Typ',
		value: val => types[val],
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
		value: val => Object.entries(val).map(([key, paramVal]) => {
			const paramKey = radioParamDesc[key];
			return escapeHtml(`${paramKey.label}: ${paramVal}${paramKey.unit}`);
		}).join('<br>'),
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
		for (const [key, paramVal] of Object.entries(node.params)) {
			const paramKey = radioParamDesc[key];
			lines.push(`  - ${paramKey.label}: ${paramVal}${paramKey.unit}`);
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

	return `
		<div class="node-qr" data-qr-value="${escapeHtml(qrValue)}"></div>
		${getTable(node)}
		<div class="user-actions">
			<button type="button" class="copy-link-btn" data-copy-value="${escapeHtml(getNodeInfoText(node))}">Skopiuj informacje</button>
			<div class="user-actions-right">
				<a href="${getDeletionMailUrl(node)}" target="_blank">Zgłoś usunięcie węzła</a>
				${userActionAnchor}
			</div>
		</div>`;
};

const getPresets = async () => {
	if (presets.length) return presets;

	const res = await fetch('https://api.meshcore.nz/api/v1/config');
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
	'OpenStreetMap': L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
		maxZoom: 19,
		attribution: 'Kafelki: &copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
	}),
	'Esri Satellite': L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
		maxZoom: 18,
		attribution: 'Kafelki: &copy; Esri',
	}),
};

const storedBaseMap = localStorage.getItem('baseMapSelected');
const baseMapSelected = Object.hasOwn(baseMaps, storedBaseMap) ? storedBaseMap : 'OpenStreetMap';

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
		try {
			new QRCode(qrEl, {
				text: qrEl.dataset.qrValue,
				width: 256,
				height: 256,
				colorDark: '#000',
				colorLight: '#fff',
				correctLevel: QRCode.CorrectLevel.M,
			});
		} catch (err) {
			console.error('Nie udało się wygenerować kodu QR:', err);
		}
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
const statsCounts = document.getElementById('stats-counts');
const regionToggle = document.getElementById('region-toggle');
const regionToggleLabel = document.getElementById('region-toggle-label');
const basemapToggle = document.getElementById('basemap-toggle');
const basemapToggleLabel = document.getElementById('basemap-toggle-label');
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

const state = {
	search: '',
	region: urlParams.region === 'all' ? 'all' : 'pl',
	nodeFilter: ['1', '2', '3', '4'],
	freqFilter: [],
	availableFreqs: [],
	fromDate: '',
	fromInsertDate: '',
	clusteringZoom: 12,
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
		marker.bindPopup(L.popup({ minWidth: 390, maxWidth: 390, content: () => getNodePopupHTML(node) }));
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

const renderLoadingProgress = (receivedBytes, totalBytes, elapsedSec) => {
	const speed = elapsedSec > 0 ? receivedBytes / elapsedSec : 0;
	const speedText = `${ntools.formatBytes(speed)}/s`;

	if (totalBytes) {
		loadingProgressBar.style.width = `${Math.min(100, (receivedBytes / totalBytes) * 100)}%`;
		loadingMeta.textContent = `${ntools.formatBytes(receivedBytes)} / ${ntools.formatBytes(totalBytes)} · ${speedText}`;
	} else {
		loadingMeta.textContent = `${ntools.formatBytes(receivedBytes)} · ${speedText}`;
	}
};

const positionDropdown = el => {
	const rect = searchInline.getBoundingClientRect();
	el.style.top = `${rect.bottom + 10}px`;

	if (window.innerWidth <= 800) {
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
	node.marker.openPopup();
	map.flyTo(node.marker.getLatLng(), 19);
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
		region: state.region,
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
		<svg class="icon pointer-help" title="Łączna liczba klientów"><use href="/icons/icons.svg#user"></use></svg><b>${(byType[1] || []).length}</b>&nbsp;|
		<svg class="icon icon-filled pointer-help" title="Łączna liczba repeaterów"><use href="/icons/node-types.svg#repeater-plain"></use></svg><b>${(byType[2] || []).length}</b>&nbsp;|
		<svg class="icon pointer-help" title="Łączna liczba serwerów pokoju"><use href="/icons/icons.svg#message"></use></svg><b>${(byType[3] || []).length}</b>
	`;

	statsModal.render();
};

function renderSearchResults() {
	if (!state.search) {
		searchResultsEl.hidden = true;
		searchResultsEl.innerHTML = '';
		return;
	}

	const nodes = state.filteredNodes.length > 0 ? state.filteredNodes : state.nodes;
	const results = nodes.filter(
		node => node.adv_name.toLowerCase().includes(state.search.toLowerCase()) || node.public_key.startsWith(state.search)
	).toSorted(
		(a, b) => a.adv_name.localeCompare(b.adv_name)
	).slice(0, 20);

	searchResultsEl.hidden = results.length === 0;
	if (!searchResultsEl.hidden) positionDropdown(searchResultsEl);
	searchResultsEl.innerHTML = results.map(node => `
		<li>
			<svg width="32" height="32"><use href="/icons/node-types.svg#${nodeTypeIconNames[node.type]}-plain"></use></svg>
			<div class="search-text">
				<h6>${highlightString(node.adv_name, state.search)}</h6>
				<div class="search-pkey">${highlightString(ntools.truncateKey(node.public_key), state.search)}</div>
			</div>
		</li>
	`).join('');

	[...searchResultsEl.children].forEach((li, index) => {
		li.addEventListener('click', () => showNode(results[index]));
	});
}

const applyFilters = () => {
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
	state.clusteringZoom = 12;

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

	try {
		setLoading(true);
		setLoadingStatus('Łączenie z serwerem...');
		const nodesReq = await fetch(apiUrl(region));
		const dataUpdatedAt = nodesReq.headers.get('X-Data-Updated');
		const totalBytes = Number(nodesReq.headers.get('Content-Length')) || 0;

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
			renderLoadingProgress(receivedBytes, totalBytes, (performance.now() - startTime) / 1000);
		}

		const nodesBuffer = new Uint8Array(receivedBytes);
		let writeOffset = 0;
		for (const chunk of chunks) {
			nodesBuffer.set(chunk, writeOffset);
			writeOffset += chunk.length;
		}

		setLoadingStatus('Rozpakowywanie danych...');
		const nodes = unpack(nodesBuffer);

		const presetsPromise = getPresets();

		const byType = {};
		const freqSet = new Set();
		const CHUNK_SIZE = 2000;

		for (let offset = 0; offset < nodes.length; offset += CHUNK_SIZE) {
			const end = Math.min(offset + CHUNK_SIZE, nodes.length);

			setLoadingStatus(`Przetwarzanie węzłów... (${end} / ${nodes.length})`);
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
				node.coords = `${node.lat.toFixed(4)}, ${node.lon.toFixed(4)}`;
				node.lastAdvertDate = new Date(node.last_advert);
				node.insertDate = new Date(node.inserted_date);
				node.updatedDate = node.updated_date && new Date(node.updated_date);
				markerToNode.set(marker, node);

				if (node.params?.freq) freqSet.add(Math.floor(node.params.freq));
			}
		}

		setLoadingStatus('Pobieranie presetów radiowych...');
		try {
			await presetsPromise;
		}
		catch (err) {
			console.error('Nie udało się pobrać presetów radiowych:', err);
		}

		nodesCache[region] = { nodes, byType, availableFreqs: [...freqSet].sort((a, b) => a - b), dataUpdatedAt };
		applyDownloadedNodes(nodesCache[region]);
	}
	catch (e) {
		alert('Wystąpił nieoczekiwany błąd podczas wczytywania danych. Spróbuj ponownie.');
		console.error(e);
	}
	finally {
		setLoading(false);
	}
};

const setRegion = async region => {
	if (region === state.region) return;

	state.region = region;
	updateRegionToggleUI();
	await downloadNodes(region);
	applyFilters();
};

searchInline.addEventListener('submit', e => e.preventDefault());

searchInput.addEventListener('input', () => {
	state.search = searchInput.value;
	renderSearchResults();
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

regionToggle.addEventListener('click', () => setRegion(state.region === 'all' ? 'pl' : 'all'));

let currentBaseMap = baseMapSelected;

const renderBaseMapToggle = () => {
	const satellite = currentBaseMap === 'Esri Satellite';
	basemapToggle.classList.toggle('active', satellite);
	basemapToggle.title = satellite ? 'Przełącz na mapę' : 'Przełącz na widok satelitarny';
	basemapToggleLabel.textContent = satellite ? 'Satelita' : 'Mapa';
};

renderBaseMapToggle();

basemapToggle.addEventListener('click', () => {
	currentBaseMap = currentBaseMap === 'Esri Satellite' ? 'OpenStreetMap' : 'Esri Satellite';
	setBaseMap(currentBaseMap);
	renderBaseMapToggle();
});

document.addEventListener('click', e => {
	const copyBtn = e.target.closest('.copy-link-btn, .copy-icon-btn');
	if (copyBtn) void navigator.clipboard.writeText(copyBtn.dataset.copyValue).then(() => showToast('Skopiowano do schowka'));
});

document.addEventListener('click', e => {
	if (!filterMenu.hidden && !filterMenu.contains(e.target) && !filterToggle.contains(e.target)) {
		filterMenu.hidden = true;
	}
	if (!searchResultsEl.hidden && !searchResultsEl.contains(e.target) && !searchInline.contains(e.target)) {
		searchResultsEl.hidden = true;
	}
});

window.addEventListener('resize', () => {
	if (!filterMenu.hidden) positionDropdown(filterMenu);
	if (!searchResultsEl.hidden) positionDropdown(searchResultsEl);
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
	applyFilters();
});

window.refreshMap = refreshMap;
