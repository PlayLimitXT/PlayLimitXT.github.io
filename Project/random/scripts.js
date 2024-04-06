document.addEventListener("DOMContentLoaded", async () => {
  const columnDisplay = document.getElementById("column");
  const rowDisplay = document.getElementById("row");
  const enterBtn = document.getElementById("enter-btn");
  const coordinate = null;
  var column = null;
  var row = null;
  let m = null;
  let n = null;
  let cachedData = null;

  async function loadJsonData() {
    try {
      const response = await fetch('data.json');
      const jsonData = await response.json();
      if (response.ok) {
        return jsonData;
      } else {
        console.error('Failed to load JSON file:', jsonData);
        return null;
      }
    } catch (error) {
      console.error('Error loading JSON file:', error);
      return null;
    }
  }

  async function init() {
    cachedData = await loadJsonData();
  }

  init();

  function getRandomCoordinate(data) {
    const columns = data.data.filter(item => 'column' in item).reduce((acc, cur) => ({...acc, [cur.column]: cur.weight}), {});
    const rows = data.data.filter(item => 'row' in item).reduce((acc, cur) => ({...acc, [cur.row]: cur.weight}), {});
    const totalColumnWeight = Object.values(columns).reduce((sum, weight) => sum + weight, 0);
    const totalRowWeight = Object.values(rows).reduce((sum, weight) => sum + weight, 0);
    const randomColumnIndex = Object.entries(columns)
      .reduce((sum, [col, weight], index, allEntries) => {
        const cumulativeWeight = sum + weight;
        if (Math.random() * totalColumnWeight <= cumulativeWeight) {
          return index;
        }
        return sum;
      }, 0);
    
    const randomRowIndex = Object.entries(rows)
      .reduce((sum, [row, weight], index, allEntries) => {
        const cumulativeWeight = sum + weight;
        if (Math.random() * totalRowWeight <= cumulativeWeight) {
          return index;
        }
        return sum;
      }, 0);
    
    return { column: randomColumnIndex + 1, row: randomRowIndex + 1 };

  }


  function startBouncing() {
    setInterval(() => {
      if (!m) {
        columnDisplay.textContent = Math.floor(Math.random() * 9) + 1;
      }
      if (!n) {
        rowDisplay.textContent = Math.floor(Math.random() * 9) + 1;
      }
    }, 50);
  }

  function stopBouncing() {
    columnDisplay.style.animation = 'none';
    rowDisplay.style.animation = 'none';
  }

  async function handleButtonClick() {
    if (!m) {
      const data = cachedData || {};
      const coordinate = getRandomCoordinate(data);
      column = coordinate.column;
      row = coordinate.row;
      m = column;
      columnDisplay.textContent = m;
      //columnDisplay.style.animation = 'none';
    } else if (!n) {
      n = row;
      rowDisplay.textContent = row;
      //rowDisplay.style.animation = 'none';
      enterBtn.textContent = 'Restart';
      document.getElementById("result").textContent = `Result: ( ${column} , ${row} )`;
    } else {
      m = n = null;
      startBouncing();
      enterBtn.textContent = 'Enter';
      document.getElementById("result").textContent = '';
      //init();
    }
  }

  enterBtn.addEventListener("click", handleButtonClick);

  startBouncing();
});
