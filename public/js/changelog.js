import { initModal } from './modal.js';

const CHANGELOG = [
	{
		version: '0.1.0',
		changes: [
			'Polskojęzyczny interfejs.',
			'Możliwość przełączania między węzłami z Polski i całego świata.',
			'Udostępnianie wybranego węzła lub kontaktu za pomocą bezpośredniego linku.',
			'Kopiowanie danych węzłów i kontaktów do schowka.',
			'Polska jako domyślnie wybrany region przy pierwszym uruchomieniu.',
			'Dane przesyłane w kompaktowym formacie MessagePack; przy domyślnym widoku pobierane są tylko węzły z Polski.',
			'Wyszukiwanie węzłów po nazwie i kluczu publicznym, z obsługą klawiatury.',
			'Frontend zbudowany w HTML, CSS i JavaScript bez frameworka aplikacyjnego, nowoczesny kod.',
		],
	},
];

export const initChangelogModal = ({ escapeHtml }) => {
	const modal = initModal('changelog-toggle', 'changelog-overlay');
	const listEl = document.getElementById('changelog-list');

	listEl.innerHTML = CHANGELOG.map(entry => `
		<li class="changelog-version">
			<div class="changelog-version-title">v${escapeHtml(entry.version)}</div>
			<ul class="changelog-changes">
				${entry.changes.map(change => `<li>${escapeHtml(change)}</li>`).join('')}
			</ul>
		</li>
	`).join('');

	return modal;
};
