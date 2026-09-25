const vietnameseCollator = new Intl.Collator('vi', { sensitivity: 'base', numeric: true });

const normalizeKey = (value) => String(value ?? '').trim().toLocaleLowerCase('vi');

const subjectLabel = (subject) => String(subject?.name || subject?.code || '');

export function quickSortSubjects(subjects) {
  const items = Array.isArray(subjects) ? [...subjects] : [];

  const sort = (left, right) => {
    if (left >= right) return;
    const pivot = subjectLabel(items[Math.floor((left + right) / 2)]);
    let low = left;
    let high = right;

    while (low <= high) {
      while (vietnameseCollator.compare(subjectLabel(items[low]), pivot) < 0) low += 1;
      while (vietnameseCollator.compare(subjectLabel(items[high]), pivot) > 0) high -= 1;
      if (low <= high) {
        [items[low], items[high]] = [items[high], items[low]];
        low += 1;
        high -= 1;
      }
    }

    if (left < high) sort(left, high);
    if (low < right) sort(low, right);
  };

  if (items.length > 1) sort(0, items.length - 1);
  return items;
}

export function buildSubjectHashMap(subjects) {
  const index = new Map();
  for (const subject of subjects || []) {
    index.set(`id:${String(subject.id)}`, subject);
    index.set(`code:${normalizeKey(subject.code)}`, subject);
    index.set(`name:${normalizeKey(subject.name)}`, subject);
  }
  return index;
}

export function findSubject(subjectIndex, value) {
  const raw = String(value ?? '').trim();
  const normalized = normalizeKey(raw);
  return subjectIndex.get(`id:${raw}`)
    || subjectIndex.get(`code:${normalized}`)
    || subjectIndex.get(`name:${normalized}`)
    || null;
}
