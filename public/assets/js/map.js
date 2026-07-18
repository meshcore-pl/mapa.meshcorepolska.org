/* global L */
import { unpack } from '../../vendor/msgpackr/msgpackr.js';
import * as ntools from './node-utils.js';
import { initSettingsModal } from './modal.js';
import { initLegendPanel } from './legend.js';

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
	'none': 'dodano ręcznie',
	'recent': 'zaktualizowano niedawno',
	'stale': 'zaktualizowano jakiś czas temu',
	'old': 'nie aktualizowano',
	'extinct': 'zostanie wkrótce usunięty',
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

const columns = {
	coords: {
		label: 'Współrzędne',
		value: val => `<a target="_blank" rel="noopener noreferrer" href="https://google.com/maps/place/${val.replace(' ', '')}">${val}</a>`,
	},
	adv_name: {
		label: 'Nazwa',
		value: val => escapeHtml(val),
	},
	status: {
		label: 'Aktualność',
		value: val => updateStatusDesc[val],
	},
	inserted_date: {
		label: 'Dodano',
		value: val => {
			const dt = new Date(val);
			return `<time datetime="${val}" title="${dt.toLocaleString()}">${timeAgo(dt.getTime())}</time>`;
		},
	},
	updated_date: {
		label: 'Zaktualizowano',
		value: val => {
			const dt = new Date(val);
			return `<time datetime="${val}" title="${dt.toLocaleString()}">${timeAgo(dt.getTime())}</time>`;
		},
	},
	public_key: {
		label: 'Klucz publiczny',
	},
	type: {
		label: 'Typ',
		value: val => types[val],
	},
	preset: {
		label: 'Preset radiowy',
		value: val => {
			const preset = findPreset(val) || {};
			return preset?.params?.freq ? preset.name : 'Niestandardowy';
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
		value: uint8arr => `<button type="button" class="copy-link-btn" data-mesh-link="meshcore://${uint8arr.toHex()}">Skopiuj do schowka</button>`,
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

const getNodePopupHTML = node => {
	const userActionUrl = encodeURI(localStorage.getItem('userActionUrl') || '');
	const userActionLabel = localStorage.getItem('userActionLabel') || '';
	const userActionAnchor = userActionUrl ? `<a target="_blank" rel="noopener noreferrer" href="https://${userActionUrl}?nodes=${node.public_key}">${userActionLabel}</a>` : '';

	return `
		${getTable(node)}
		<div class="user-actions">
			<a href="${getDeletionMailUrl(node)}" target="_blank">Zgłoś usunięcie węzła</a>
			${userActionAnchor}
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
			freq: p.frequency,
			bw: p.bandwidth,
			sf: p.spreading_factor,
			cr: p.coding_rate,
		},
	}));

	presets.unshift({
		name: 'Wszystkie presety',
		params: {},
	});

	return presets;
};

const baseMapSelected = localStorage.getItem('baseMapSelected') || 'OpenStreetMap';
const baseMaps = {
	'OpenStreetMap': L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
		maxZoom: 19,
		attribution: 'Tiles: &copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
	}),
	'Esri Satellite': L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
		maxZoom: 18,
		attribution: 'Tiles: &copy; Esri | Sources: Esri, DigitalGlobe, GeoEye, i-cubed, USDA FSA, USGS, AEX, Getmapping, Aerogrid, IGN, IGP, swisstopo, GIS Users',
	}),
};

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
	layers: baseMaps[baseMapSelected],
	zoomControl: false,
}).setView([initialView.lat, initialView.lon], initialView.zoom);

map.attributionControl.setPrefix('<a href="https://leafletjs.com" title="A JS library for interactive maps">Leaflet</a>');
map.attributionControl.setPosition('bottomleft');

map.on('baselayerchange', ev => localStorage.setItem('baseMapSelected', ev.name));

L.control.layers(baseMaps, null, { position: 'bottomleft' }).addTo(map);

const nodeTypeIconNames = { 1: 'client', 2: 'repeater', 3: 'room-server', 4: 'sensor' };

const icons = Object.fromEntries(['none', 'recent', 'stale', 'old', 'extinct'].map(color => [color,
	Object.fromEntries([2, 3, 4].map(id => [id, L.divIcon({
		html: `<svg width="32" height="32"><use href="/assets/icons/node-types.svg#${nodeTypeIconNames[id]}"></use></svg>`,
		className: `svg-node-icon update-${color}`,
		iconSize: [32, 32],
		iconAnchor: [17, 17],
		popupAnchor: [0, -16],
	})])),
]));

const loadingOverlay = document.getElementById('loading-overlay');
const statsCounts = document.getElementById('stats-counts');
const regionToggle = document.getElementById('region-toggle');
const regionToggleLabel = document.getElementById('region-toggle-label');
const settingsModal = initSettingsModal();
const legendPanelUi = initLegendPanel();
settingsModal.toggle.addEventListener('click', () => legendPanelUi.close());
legendPanelUi.toggle.addEventListener('click', () => settingsModal.close());
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

const markerToNode = new WeakMap();

let markerClusterGroup = L.markerClusterGroup({
	disableClusteringAtZoom: state.clusteringZoom,
	chunkedLoading: true,
});

const ensurePopup = marker => {
	if (marker._popupBound) return;

	const node = markerToNode.get(marker);
	if (node) {
		marker.bindPopup(L.popup({ minWidth: 350, maxWidth: 350, content: () => getNodePopupHTML(node) }));
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

// showNode and renderSearchResults call each other, so they stay as hoisted function
// declarations - a genuine mutual reference that const arrow functions can't express.
function showNode(node) {
	ensurePopup(node.marker);
	node.marker.openPopup();
	map.flyTo(node.marker.getLatLng(), 19);
	state.search = '';
	searchInput.value = '';
	renderSearchResults();
}

const highlightString = (source, toHighlight) => {
	const escapedSource = source.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
	const matchIndex = source.toLowerCase().indexOf(toHighlight.toLowerCase());
	const highlight = matchIndex >= 0 ? source.substring(matchIndex, matchIndex + toHighlight.length) : toHighlight;
	return escapedSource.replace(highlight, `<b>${highlight}</b>`);
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
	const now = Date.now();
	const msPerDay = 86400000;
	const t1 = now - msPerDay;
	const t7 = now - 7 * msPerDay;
	const t30 = now - 30 * msPerDay;
	let c1 = 0, c7 = 0, c30 = 0;

	for (let i = 0; i < nodes.length; i++) {
		const insertMs = nodes[i].insertDate.getTime();
		if (insertMs > t1) c1++;
		if (insertMs > t7) c7++;
		if (insertMs > t30) c30++;
	}

	statsCounts.innerHTML = `
		<span>razem: <b>${nodes.length}</b></span>&nbsp;|
		<svg class="icon pointer-help"><use href="/assets/icons/icons.svg#icon-user"></use></svg><b>${(byType[1] || []).length}</b>&nbsp;|
		<svg class="icon icon-filled pointer-help"><use href="/assets/icons/node-types.svg#repeater-plain"></use></svg><b>${(byType[2] || []).length}</b>&nbsp;|
		<svg class="icon pointer-help"><use href="/assets/icons/icons.svg#icon-users"></use></svg><b>${(byType[3] || []).length}</b>
		<span class="pointer-help" title="Węzły dodane w ciągu ostatnich 24 godzin">24h: <b>${c1}</b></span>
		<span class="pointer-help" title="Węzły dodane w ciągu ostatnich 7 dni">7d: <b>${c7}</b></span>
		<span class="pointer-help" title="Węzły dodane w ciągu ostatnich 30 dni">30d: <b>${c30}</b></span>
	`;
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
	searchResultsEl.innerHTML = results.map((node, index) => `
		<li data-index="${index}">
			<svg width="32" height="32"><use href="/assets/icons/node-types.svg#${nodeTypeIconNames[node.type]}-plain"></use></svg>
			<div class="search-text">
				<h6>${highlightString(node.adv_name, state.search)}</h6>
				<div class="search-pkey">${highlightString(node.public_key, state.search)}</div>
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

const applyDownloadedNodes = cached => {
	state.nodesByType = cached.byType;
	state.nodes = cached.nodes;
	state.availableFreqs = cached.availableFreqs;
	renderStats();
	renderFreqFilters();
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
		const nodesReq = await fetch(apiUrl(region));
		const nodesBlob = await nodesReq.blob();
		const nodes = unpack(await nodesBlob.arrayBuffer());

		void getPresets();

		const byType = {};
		const freqSet = new Set();
		const CHUNK_SIZE = 2000;

		for (let offset = 0; offset < nodes.length; offset += CHUNK_SIZE) {
			const end = Math.min(offset + CHUNK_SIZE, nodes.length);

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

		nodesCache[region] = { nodes, byType, availableFreqs: [...freqSet].sort((a, b) => a - b) };
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

document.addEventListener('click', e => {
	const copyBtn = e.target.closest('.copy-link-btn');
	if (copyBtn) void navigator.clipboard.writeText(copyBtn.dataset.meshLink);
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
