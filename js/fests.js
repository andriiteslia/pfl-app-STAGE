/* ============================================
   PFL App — Fests Module
   Year switching, fest cards, hardcoded 2025 data
   ============================================ */

import { $, $$, escapeHtml, setButtonLoading, haptic, showToast } from './utils.js';
import { mountFests2026, resetFests2026 } from './fests2026.js';

// ---- Hardcoded Data 2025 ----
const DATA_2025 = {
  // Predator 2025 - Командний залік
  predator2: [
    ['№', 'Команда*', 'Бали', 'Вага (г): 27653'],
    ['1', 'Fusion два і пять (Боженко Н, Свердел Т)', '9', '5436'],
    ['2', 'Jig Brothers (Бернацький Ю, В)', '15', '2530'],
    ['3', 'Сірі кепки Simms (Предзимірський А, Сало Д)', '18', '3759'],
    ['4', 'Удар (Лучко В, Хайпре О)', '20', '2542'],
    ['5', 'Опілля (Стефінів А, Григорів Д)', '22', '2209'],
    ['6', 'Чарівні Озера (Гавдан Б, Пасєка С)', '25', '1808'],
    ['7', 'Twin Power (Мелець А, Тесля А)', '27', '2051'],
    ['8', 'MadFish Golden Catch (Столяр Б, Дмитрів В)', '30', '1723'],
    ['9', 'Два Окуня (Хомин Н, Александрук А)', '31', '1688'],
    ['10', 'Predator (Томілов С, Донець В)', '34', '1391'],
    ['11', 'Гострі Картузи (Гутий Ю, Козак Н)', '35', '1326'],
    ['12', 'Сусіди (Крокіс Д, Лега Р)', '48', '667'],
    ['13', 'Cool Dude (Маринчук О, Худоба В)', '52', '358'],
    ['14', 'РОДА (Марусяк Ю, Маєцький А)', '60', '132'],
    ['15', "AL'S Barbershop (Мороз В, Аллахвердієв Азар)", '65', '33'],
    ['16', "Hloviakfamily (Глов'як Назар та Вікторія)", '68', '0'],
  ],

  // PERCH MASTER - Тури
  perchTours: [
    ['Учасник', 'Вага (г): 5123', 'Бали', 'Вага (г): 2983', 'Бали', 'Вага (г): 2514', 'Бали', 'Вага (г): 3100', 'Бали'],
    ['Стефінів Андрій', '404', '3', '344', '2', '104', '11', '186', '9'],
    ['Тесля Андрій', '328', '9', '116', '13', '198', '5', '355', '3'],
    ['Бернацький Юрій', '399', '4', '103', '15', '78', '12', '241', '5'],
    ['Носик Іван', '594', '1', '386', '1', '207', '4', '417', '2'],
    ['Усач Віталій', '64', '16', '60', '16', '60', '13', '48', '14'],
    ['Григоров Дмитро', '373', '5', '274', '4', '262', '3', '239', '6'],
    ['Шамін Віталій', '174', '14,5', '133', '11', '50', '14', '18', '15'],
    ['Пиріг Андрій', '174', '14,5', '110', '14', '47', '15', '16', '16'],
    ['Мартиць Остап', '365', '6', '228', '5', '435', '1', '101', '11'],
    ['Столяр Богдан', '272', '11', '170', '7', '264', '2', '303', '4'],
    ['Гутий Юрій', '330', '8', '166', '8', '115', '10', '65', '13'],
    ['Мелець Андрій', '502', '2', '126', '12', '136', '9', '140', '10'],
    ['Боженко Назар', '270', '12', '298', '3', '176', '8', '98', '12'],
    ['Гавдан Данило', '275', '10', '150', '9', '185', '6', '193', '8'],
    ['Лучко Віктор', '352', '7', '141', '10', '181', '7', '232', '7'],
    ['Орищин Олег', '247', '13', '178', '6', '16', '16', '448', '1'],
  ],

  // PERCH MASTER - Результати
  perchResults: [
    ['№', 'Учасник*', 'Бали', 'Вага (г): 13720'],
    ['1', 'Носик Іван', '8', '1604'],
    ['2', 'Григоров Дмитро', '18', '1148'],
    ['3', 'Мартиць Остап', '23', '1129'],
    ['4', 'Столяр Богдан', '24', '1009'],
    ['5', 'Стефінів Андрій', '25', '1038'],
    ['6', 'Тесля Андрій', '30', '997'],
    ['7', 'Лучко Віктор', '31', '906'],
    ['8', 'Мелець Андрій', '33', '904'],
    ['9', 'Гавдан Данило', '33', '803'],
    ['10', 'Боженко Назар', '35', '842'],
    ['11', 'Орищин Олег', '36', '889'],
    ['12', 'Бернацький Юрій', '36', '821'],
    ['13', 'Гутий Юрій', '39', '676'],
    ['14', 'Шамін Віталій', '54,5', '375'],
    ['15', 'Усач Віталій', '59', '232'],
    ['16', 'Пиріг Андрій', '59,5', '347'],
  ],

  // PREDATOR CUP 2025 - Особистий залік
  predatorPersonal: [
    ['№', 'Учасник', 'Бали', 'Вага, г'],
    ['1', 'Мартиць Остап', '30', '2965'],
    ['2', 'Томілов Сергій', '40', '920'],
    ['3', 'Стефінів Андрій', '42', '1765'],
    ['4', 'Бернацький Юрій', '43,5', '3485'],
    ['5', 'Гутий Юрій', '46', '1310'],
    ['6', 'Донець Володимир', '47,5', '2190'],
    ['7', 'Крупник Євген', '48', '3430'],
    ['8', 'Мелець Андрій', '48', '855'],
    ['9', 'Кулик Олег', '59', '1125'],
    ['10', 'Гнатів Андрій', '61', '3465'],
    ['11', 'Гавдан Богдан', '61', '1080'],
    ['12', 'Лега Роман', '68,5', '500'],
    ['13', 'Пиріг Андрій', '69', '3255'],
    ['14', 'Столяр Богдан', '71', '575'],
    ['15', 'Головня Сергій', '71,5', '3605'],
    ['16', 'Школик Данило', '74,5', '665'],
    ['17', 'Гавдан Данило', '75', '530'],
    ['18', 'Зарума Володимир', '84,5', '280'],
    ['19', 'Никитський Михайло', '85', '660'],
    ['20', 'Матяк Данило', '85', '345'],
    ['21', 'Шамін Віталій', '90', '1850'],
    ['22', 'Свіца Дмитро', '92', '2165'],
    ['23', 'Комарніцький Степан', '94', '590'],
    ['24', 'Тесля Андрій', '94', '375'],
    ['25', 'Дудик Зеновій', '97', '5185'],
    ['26', 'Бернацький Володимир', '102,5', '635'],
    ['27', 'Оліярник Олексій', '106', '5055'],
    ['28', 'Нагірний Сергій', '111', '1340'],
    ['29', 'Видюк Гостомисл', '113', '350'],
    ['30', 'Маринчук Олександр', '113', '330'],
    ['31', 'Допко Максим', '125,5', '310'],
    ['32', 'Апончук Іван', '127', '3585'],
    ['33', 'Ілов Василь', '127', '1915'],
    ['34', 'Гарматюк Назар', '131', '2810'],
    ['35', 'Марусяк Юрій', '132', '700'],
    ['36', 'Тимців Володимир', '134,5', '5215'],
    ['37', 'Івахів Григорій', '137,5', '440'],
    ['38', 'Паляниця Олександр', '149', '95'],
    ['39', 'Гловяк Назар', '157', '1755'],
    ['40', 'Чарковський Максим', '157', '960'],
    ['41', 'Романець Андрій', '157', '475'],
    ['42', 'Хотинський Андрій', '158', '215'],
    ['43', 'Маєцький Артем', '159', '240'],
    ['44', "Пелех Дем'ян", '159', '110'],
    ['45', 'Матюх Володимир', '160', '660'],
    ['46', 'Мозіль Назар', '162', '250'],
    ['47', 'Крамар Вадим', '165', '290'],
    ['48', 'Іваницький Максим', '186', '0'],
    ['49', 'Бамбуца Ігор', '186', '0'],
    ['50', 'Кравець Андрій', '186', '0'],
    ['51', 'Кідиба Антон', '186', '0'],
    ['52', 'Лукачик Тарас', '186', '0'],
    ['53', 'Мороз Володимир', '186', '0'],
    ['54', 'Міщак Денис', '186', '0'],
    ['55', 'Пелех Роман', '186', '0'],
    ['56', 'Покотило Захар', '186', '0'],
    ['57', 'Соколовський Віталій', '186', '0'],
    ['58', 'Степаняк Юрій', '186', '0'],
    ['59', 'Шепа Володимир', '186', '0'],
    ['60', 'Ярмак Олександр', '186', '0'],
  ],

  // PREDATOR CUP 2025 - Командний залік
  predatorTeam: [
    ['№', 'Команда', 'Бали', 'Вага, г'],
    ['1', 'Predator', '87,5', '3110'],
    ['2', 'Танта', '101', '3540'],
    ['3', 'Нестримні', '109', '6895'],
    ['4', 'Двоє в каное', '120,5', '1975'],
    ['5', 'SK Anglers', '126,5', '2045'],
    ['6', 'DABLBASS', '136', '1610'],
    ['7', 'Twin Power', '142', '1230'],
    ['8', 'Jig Brothers', '146', '4120'],
    ['9', 'Явір', '156', '6310'],
    ['10', 'Fish Ars', '156,5', '4265'],
    ['11', 'ABBA', '159', '5105'],
    ['12', 'Golden Catch', '225', '3400'],
    ['13', 'Зубата Братва', '238,5', '660'],
    ['14', 'COOL DUDE', '240', '2245'],
    ['15', 'FishSpot', '247', '595'],
    ['16', 'The Main', '254,5', '500'],
    ['17', 'Мамині Синочки', '268', '2300'],
    ['18', 'Клеванські', '278', '2165'],
    ['19', 'Фіксики', '284', '4060'],
    ['20', 'РОДА', '291', '940'],
    ['21', 'SV Fishing', '292', '5055'],
    ['22', 'VV', '299,5', '5505'],
    ['23', 'Я і мій кум', '309', '755'],
    ['24', 'Бобри', '323,5', '440'],
    ['25', 'Рибацюги', '343', '1755'],
    ['26', 'Strike Pro', '344', '215'],
    ['27', 'Пелех&Кравець', '345', '110'],
    ['28', 'Дарт Воблер', '372', '0'],
    ['29', 'Зубатолови', '372', '0'],
    ['30', 'Трояни', '372', '0'],
  ],
};

// ---- State ----
let activeYear = '2025';

const cardStates = {
  perch: { isOpen: false, view: 'results' },
  predator: { isOpen: false, view: 'personal' },
  predator2: { isOpen: false },
};

// ---- Initialize ----
export function initFests() {
  // Year tags
  $$('.fests-year-tag').forEach(tag => {
    tag.addEventListener('click', () => {
      const year = tag.dataset.year;
      if (year && year !== activeYear) {
        switchYear(year);
      }
    });
  });

  // Reload button
  const reloadBtn = $('#reload');
  if (reloadBtn) {
    reloadBtn.addEventListener('click', () => {
      haptic('light');
      reloadFests();
    });
  }

  // Setup card interactions
  setupPerchCard();
  setupPredatorCard();
  setupPredator2Card();

  console.log('[Fests] Initialized');
}

// ---- Switch Year ----
function switchYear(year) {
  activeYear = year;
  haptic('light');

  $$('.fests-year-tag').forEach(tag => {
    tag.classList.toggle('active', tag.dataset.year === year);
  });

  const panel2026 = $('#festsYear2026');
  const panel2025 = $('#festsYear2025');

  if (panel2026) panel2026.style.display = year === '2026' ? 'block' : 'none';
  if (panel2025) panel2025.style.display = year === '2025' ? 'block' : 'none';

  const subtitle = $('#subtitle-fests');
  if (subtitle) {
    subtitle.textContent = year === '2026' ? 'Фести 2026 року' : 'Результати сезону 2025';
  }

  if (year === '2026') {
    mountFests2026();
  }
}

// ---- Reload Fests ----
async function reloadFests() {
  const reloadBtn = $('#reload');
  const subtitle = $('#subtitle-fests');
  
  setButtonLoading(reloadBtn, true);
  if (subtitle) subtitle.textContent = 'Оновлюю дані…';

  try {
    if (activeYear === '2025') {
      // Simulate reload delay for UX
      await new Promise(r => setTimeout(r, 300));
      
      // Re-render open cards
      if (cardStates.perch.isOpen) {
        renderPerchData();
      }
      if (cardStates.predator.isOpen) {
        renderPredatorData();
      }
      if (cardStates.predator2.isOpen) {
        renderPredator2Data();
      }
      
      if (subtitle) subtitle.textContent = 'Результати сезону 2025';
      showToast('Оновлено ✓');
    } else {
      resetFests2026();
      await mountFests2026({ force: true });
      if (subtitle) subtitle.textContent = 'Фести 2026 року';
      showToast('Оновлено ✓');
    }
  } catch (e) {
    console.error('[Fests] Reload error:', e);
    if (subtitle) subtitle.textContent = 'Помилка завантаження';
  } finally {
    setButtonLoading(reloadBtn, false);
  }
}

// ---- Load Fests Data ----
export async function loadFestsData({ force = false } = {}) {
  console.log('[Fests] Ready (2025 data hardcoded)');
}

// ---- Perch Card ----
function setupPerchCard() {
  const header = $('#tableHeaderPerch');
  const segment = $('#segmentPerch');

  if (!header) return;

  header.addEventListener('click', () => {
    cardStates.perch.isOpen = !cardStates.perch.isOpen;
    haptic('light');
    updatePerchView();
    
    if (cardStates.perch.isOpen) {
      renderPerchData();
    }
  });

  if (segment) {
    segment.querySelectorAll('.segment').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const view = btn.dataset.view;
        if (view === cardStates.perch.view) return;

        cardStates.perch.view = view;
        haptic('light');

        segment.querySelectorAll('.segment').forEach(s => {
          s.classList.toggle('active', s.dataset.view === view);
        });

        updatePerchView();
        renderPerchData();
      });
    });
  }
}

function updatePerchView() {
  const chevron = $('#chevronPerch');
  const segment = $('#segmentPerch');
  const outResults = $('#outPerchResults');
  const outTours = $('#outPerchTours');
  
  const isOpen = cardStates.perch.isOpen;
  const view = cardStates.perch.view;

  chevron?.classList.toggle('open', isOpen);
  if (segment) segment.style.display = isOpen ? 'flex' : 'none';

  if (!isOpen) {
    outResults?.classList.add('table-collapsed');
    outTours?.classList.add('table-collapsed');
    return;
  }

  if (view === 'tours') {
    outResults?.classList.add('table-collapsed');
    outTours?.classList.remove('table-collapsed');
  } else {
    outTours?.classList.add('table-collapsed');
    outResults?.classList.remove('table-collapsed');
  }
}

function renderPerchData() {
  const view = cardStates.perch.view;
  
  if (view === 'results') {
    const out = $('#outPerchResults');
    if (out) renderTableInto(DATA_2025.perchResults, out);
  } else {
    const out = $('#outPerchTours');
    if (out) renderTableInto(DATA_2025.perchTours, out);
  }
}

// ---- Predator Card ----
function setupPredatorCard() {
  const header = $('#tableHeaderPredator');
  const segment = $('#segmentPredator');

  if (!header) return;

  header.addEventListener('click', () => {
    cardStates.predator.isOpen = !cardStates.predator.isOpen;
    haptic('light');
    updatePredatorView();
    
    if (cardStates.predator.isOpen) {
      renderPredatorData();
    }
  });

  if (segment) {
    segment.querySelectorAll('.segment').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const view = btn.dataset.view;
        if (view === cardStates.predator.view) return;

        cardStates.predator.view = view;
        haptic('light');

        segment.querySelectorAll('.segment').forEach(s => {
          s.classList.toggle('active', s.dataset.view === view);
        });

        updatePredatorView();
        renderPredatorData();
      });
    });
  }
}

function updatePredatorView() {
  const chevron = $('#chevronPredator');
  const segment = $('#segmentPredator');
  const outPersonal = $('#outPredatorPersonal');
  const outTeam = $('#outPredatorTeam');
  
  const isOpen = cardStates.predator.isOpen;
  const view = cardStates.predator.view;

  chevron?.classList.toggle('open', isOpen);
  if (segment) segment.style.display = isOpen ? 'flex' : 'none';

  if (!isOpen) {
    outPersonal?.classList.add('table-collapsed');
    outTeam?.classList.add('table-collapsed');
    return;
  }

  if (view === 'team') {
    outPersonal?.classList.add('table-collapsed');
    outTeam?.classList.remove('table-collapsed');
  } else {
    outTeam?.classList.add('table-collapsed');
    outPersonal?.classList.remove('table-collapsed');
  }
}

function renderPredatorData() {
  const view = cardStates.predator.view;
  
  if (view === 'personal') {
    const out = $('#outPredatorPersonal');
    if (out) renderTableInto(DATA_2025.predatorPersonal, out);
  } else {
    const out = $('#outPredatorTeam');
    if (out) renderTableInto(DATA_2025.predatorTeam, out);
  }
}

// ---- Predator 2 Card ----
function setupPredator2Card() {
  const header = $('#tableHeaderPredator2');

  if (!header) return;

  header.addEventListener('click', () => {
    cardStates.predator2.isOpen = !cardStates.predator2.isOpen;
    haptic('light');
    
    const chevron = $('#chevronPredator2');
    const out = $('#outPredator2');
    
    chevron?.classList.toggle('open', cardStates.predator2.isOpen);
    out?.classList.toggle('table-collapsed', !cardStates.predator2.isOpen);

    if (cardStates.predator2.isOpen) {
      renderPredator2Data();
    }
  });
}

function renderPredator2Data() {
  const out = $('#outPredator2');
  if (out) renderTableInto(DATA_2025.predator2, out);
}

// ---- Render Table ----
function renderTableInto(values, targetEl) {
  if (!Array.isArray(values) || values.length === 0) {
    targetEl.innerHTML = '<div class="loading-text">Немає даних</div>';
    return;
  }

  const header = values[0];
  const rows = values.slice(1);

  const thead = '<tr>' + header.map(h => `<th>${escapeHtml(h)}</th>`).join('') + '</tr>';

  const tbody = rows.map(r =>
    '<tr>' + r.map(c => `<td>${escapeHtml(c).replace(/\n/g, '<br>')}</td>`).join('') + '</tr>'
  ).join('');

  targetEl.innerHTML = `
    <div class="table-wrap" role="region" aria-label="Table">
      <table>
        <thead>${thead}</thead>
        <tbody>${tbody}</tbody>
      </table>
    </div>
  `;
}

// ---- Export ----
export function isFestsLoaded() {
  return true;
}
