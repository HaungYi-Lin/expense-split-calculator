const pageIds = ["homePage", "averagePage", "personalPage", "settlementPage"];
const pageHashes = {
  homePage: "home",
  averagePage: "average",
  personalPage: "personal",
  settlementPage: "settlement"
};

let averageLineText = "";
let personalLineText = "";
let settlementLineText = "";

document.addEventListener("DOMContentLoaded", () => {
  preventFormSubmit();
  bindNavigation();
  initAveragePage();
  initPersonalPage();
  initSettlementPage();
  showPage(getPageIdFromHash() || "homePage", false);
});

function preventFormSubmit() {
  document.querySelectorAll("form").forEach((form) => {
    form.addEventListener("submit", (event) => event.preventDefault());
  });
}

function bindNavigation() {
  document.querySelectorAll("[data-show-page], [data-target]").forEach((element) => {
    element.addEventListener("click", (event) => {
      event.preventDefault();
      const pageId = element.dataset.showPage || element.dataset.target;
      showPage(pageId);
    });
  });

  window.addEventListener("hashchange", () => {
    showPage(getPageIdFromHash() || "homePage", false);
  });
}

function showPage(pageId, updateHash = true) {
  if (!pageIds.includes(pageId)) {
    pageId = "homePage";
  }

  pageIds.forEach((id) => {
    const page = document.getElementById(id);
    if (page) {
      page.classList.toggle("is-active", id === pageId);
    }
  });

  document.querySelectorAll(".nav-links a").forEach((link) => {
    link.classList.toggle("is-active", link.dataset.target === pageId);
  });

  clearAllMessages();
  window.scrollTo({ top: 0, behavior: "smooth" });

  if (updateHash) {
    history.pushState(null, "", `#${pageHashes[pageId] || "home"}`);
  }
}

function getPageIdFromHash() {
  const hash = window.location.hash.replace("#", "");
  const found = Object.entries(pageHashes).find(([, value]) => value === hash);
  return found ? found[0] : null;
}

function clearAllMessages() {
  document.querySelectorAll(".message").forEach((message) => {
    message.textContent = "";
    message.className = "message";
  });
}

function setMessage(id, text, type = "error") {
  const element = document.getElementById(id);
  if (!element) return;
  element.textContent = text;
  element.className = `message ${type}`;
}

function readNumber(id, defaultValue = 0) {
  const element = document.getElementById(id);
  const value = Number(element.value);
  return Number.isFinite(value) ? value : defaultValue;
}

function formatMoney(value) {
  const safeValue = Math.abs(value) < 0.005 ? 0 : value;
  const hasDecimals = Math.abs(safeValue - Math.round(safeValue)) > 0.001;
  return `${safeValue.toLocaleString("zh-TW", {
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: 2
  })} 元`;
}

function roundByMode(value, mode) {
  if (mode === "ceil") return Math.ceil(value);
  if (mode === "floor") return Math.floor(value);
  if (mode === "decimal") return Math.round(value * 100) / 100;
  return Math.round(value);
}

function getUnit(mode) {
  return mode === "decimal" ? 0.01 : 1;
}

function toUnits(value, mode) {
  return Math.round(value / getUnit(mode));
}

function fromUnits(units, mode) {
  return units * getUnit(mode);
}

function distributeAmount(total, weights, mode) {
  const unit = getUnit(mode);
  const targetUnits = Math.round(total / unit);
  const rawShares = weights.map((weight) => total * weight);
  const baseShares = rawShares.map((value) => roundByMode(value, mode));
  let baseUnits = baseShares.map((value) => toUnits(value, mode));
  let diff = targetUnits - baseUnits.reduce((sum, value) => sum + value, 0);

  // 依照目前誤差逐一補差，確保顯示金額加總等於目標總額。
  let index = 0;
  while (diff !== 0 && baseUnits.length > 0) {
    const direction = diff > 0 ? 1 : -1;
    if (baseUnits[index] + direction >= 0) {
      baseUnits[index] += direction;
      diff -= direction;
    }
    index = (index + 1) % baseUnits.length;
  }

  return baseUnits.map((units) => fromUnits(units, mode));
}

function distributeByRawShares(rawShares, targetTotal, mode) {
  const unit = getUnit(mode);
  const targetUnits = Math.round(targetTotal / unit);
  const baseShares = rawShares.map((value) => Math.max(0, roundByMode(value, mode)));
  let baseUnits = baseShares.map((value) => toUnits(value, mode));
  let diff = targetUnits - baseUnits.reduce((sum, value) => sum + value, 0);
  let index = 0;

  while (diff !== 0 && baseUnits.length > 0) {
    const direction = diff > 0 ? 1 : -1;
    if (baseUnits[index] + direction >= 0) {
      baseUnits[index] += direction;
      diff -= direction;
    }
    index = (index + 1) % baseUnits.length;
  }

  return baseUnits.map((units) => fromUnits(units, mode));
}

function settleDebts(members) {
  const receivers = members
    .filter((member) => member.balance > 0.004)
    .map((member) => ({ name: member.name, amount: Math.round(member.balance * 100) / 100 }));
  const payers = members
    .filter((member) => member.balance < -0.004)
    .map((member) => ({ name: member.name, amount: Math.round(Math.abs(member.balance) * 100) / 100 }));
  const transfers = [];
  let payerIndex = 0;
  let receiverIndex = 0;

  while (payerIndex < payers.length && receiverIndex < receivers.length) {
    const payer = payers[payerIndex];
    const receiver = receivers[receiverIndex];
    const amount = Math.min(payer.amount, receiver.amount);

    if (amount > 0.004) {
      transfers.push({
        from: payer.name,
        to: receiver.name,
        amount: Math.round(amount * 100) / 100
      });
    }

    payer.amount = Math.round((payer.amount - amount) * 100) / 100;
    receiver.amount = Math.round((receiver.amount - amount) * 100) / 100;

    if (payer.amount <= 0.004) payerIndex += 1;
    if (receiver.amount <= 0.004) receiverIndex += 1;
  }

  return transfers;
}

function getStatus(balance) {
  if (balance > 0.004) return { text: `應收 ${formatMoney(balance)}`, className: "status-receive" };
  if (balance < -0.004) return { text: `應付 ${formatMoney(Math.abs(balance))}`, className: "status-pay" };
  return { text: "已結清", className: "status-clear" };
}

function buildSummary(items) {
  return `
    <div class="summary-grid">
      ${items.map((item) => `
        <div class="summary-item">
          <strong>${item.label}</strong>
          <span>${item.value}</span>
        </div>
      `).join("")}
    </div>
  `;
}

function buildTransferList(transfers) {
  if (!transfers.length) {
    return `<p class="notice ok">目前沒有需要轉帳的項目。</p>`;
  }

  return `
    <ol class="transfer-list">
      ${transfers.map((transfer) => `<li>${transfer.from} 給 ${transfer.to}：${formatMoney(transfer.amount)}</li>`).join("")}
    </ol>
  `;
}

function copyText(text, messageId) {
  if (!text) {
    setMessage(messageId, "目前沒有可複製的結算文字，請先完成計算。");
    return;
  }

  if (!navigator.clipboard || !navigator.clipboard.writeText) {
    setMessage(messageId, "此瀏覽器不支援自動複製，請手動選取 LINE 文字區內容。");
    return;
  }

  navigator.clipboard.writeText(text)
    .then(() => setMessage(messageId, "已複製結算文字，可以貼到 LINE 群組。", "success"))
    .catch(() => setMessage(messageId, "複製失敗，請手動選取 LINE 文字區內容。"));
}

function initAveragePage() {
  document.getElementById("avgCalculate").addEventListener("click", calculateAverage);
  document.getElementById("avgExample").addEventListener("click", fillAverageExample);
  document.getElementById("avgClear").addEventListener("click", clearAverage);
  document.getElementById("avgCopy").addEventListener("click", () => copyText(averageLineText, "avgMessage"));
}

function calculateAverage() {
  const total = readNumber("avgTotal");
  const people = readNumber("avgPeople");
  const servicePercent = readNumber("avgService");
  const discount = readNumber("avgDiscount");
  const payer = document.getElementById("avgPayer").value.trim() || "付款者";
  const mode = document.getElementById("avgRounding").value;

  if (total < 0) return setMessage("avgMessage", "總金額不可小於 0。");
  if (!Number.isInteger(people) || people < 2) return setMessage("avgMessage", "人數至少需要 2 人。");
  if (servicePercent < 0) return setMessage("avgMessage", "服務費百分比不可小於 0。");

  const serviceFee = total * servicePercent / 100;
  if (discount < 0 || discount > total + serviceFee) {
    return setMessage("avgMessage", "折扣金額不可小於 0，也不可大於總金額加服務費。");
  }

  const finalTotal = total + serviceFee - discount;
  const names = Array.from({ length: people }, (_, index) => index === 0 ? payer : String.fromCharCode(65 + index));
  const shares = distributeAmount(finalTotal, Array(people).fill(1 / people), mode);
  const transfers = names.slice(1).map((name, index) => ({
    from: name,
    to: payer,
    amount: shares[index + 1]
  })).filter((transfer) => transfer.amount > 0);

  averageLineText = [
    "【多人花費分攤結果】",
    "",
    `本次總金額：${formatMoney(finalTotal)}`,
    `人數：${people} 人`,
    `每人應付：${shares.map((share, index) => `${names[index]} ${formatMoney(share)}`).join("、")}`,
    "",
    "轉帳建議：",
    ...(transfers.length ? transfers.map((transfer) => `${transfer.from} 給 ${transfer.to}：${formatMoney(transfer.amount)}`) : ["無需轉帳"]),
    "",
    "備註：",
    "以上金額已包含服務費與折扣。"
  ].join("\n");

  document.getElementById("avgResult").innerHTML = `
    <div class="result-card">
      <h2>計算摘要</h2>
      ${buildSummary([
        { label: "原始總金額", value: formatMoney(total) },
        { label: "服務費金額", value: formatMoney(serviceFee) },
        { label: "折扣金額", value: formatMoney(discount) },
        { label: "最終總金額", value: formatMoney(finalTotal) }
      ])}
    </div>
    <div class="result-card">
      <h2>每人應付金額</h2>
      <div class="table-wrap">
        <table>
          <thead><tr><th>姓名</th><th>應付金額</th><th>狀態</th></tr></thead>
          <tbody>
            ${shares.map((share, index) => `
              <tr>
                <td>${names[index]}</td>
                <td>${formatMoney(share)}</td>
                <td>${index === 0 ? "付款者代墊" : `轉給 ${payer}`}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </div>
    <div class="result-card">
      <h2>轉帳建議</h2>
      ${buildTransferList(transfers)}
    </div>
    <div class="result-card">
      <h2>LINE 結算文字</h2>
      <textarea class="line-text" readonly>${averageLineText}</textarea>
    </div>
  `;
  setMessage("avgMessage", "計算完成。", "success");
}

function fillAverageExample() {
  document.getElementById("avgTotal").value = 1200;
  document.getElementById("avgPeople").value = 4;
  document.getElementById("avgService").value = 10;
  document.getElementById("avgDiscount").value = 0;
  document.getElementById("avgPayer").value = "A";
  document.getElementById("avgRounding").value = "round";
  document.getElementById("avgResult").innerHTML = "";
  averageLineText = "";
  setMessage("avgMessage", "已填入範例資料，可直接按開始計算。", "success");
}

function clearAverage() {
  document.getElementById("averageForm").reset();
  document.getElementById("avgService").value = 0;
  document.getElementById("avgDiscount").value = 0;
  document.getElementById("avgPayer").value = "付款者";
  document.getElementById("avgResult").innerHTML = "";
  averageLineText = "";
  setMessage("avgMessage", "已清除簡易平均分攤資料。", "success");
}

function initPersonalPage() {
  document.getElementById("personalAdd").addEventListener("click", () => addPersonalMember());
  document.getElementById("personalCalculate").addEventListener("click", calculatePersonal);
  document.getElementById("personalExample").addEventListener("click", fillPersonalExample);
  document.getElementById("personalClear").addEventListener("click", clearPersonal);
  document.getElementById("personalCopy").addEventListener("click", () => copyText(personalLineText, "personalMessage"));
  addPersonalMember("A", 0, 0);
  addPersonalMember("B", 0, 0);
}

function addPersonalMember(name = "", expense = 0, paid = 0) {
  const list = document.getElementById("personalMembers");
  const nextName = name || String.fromCharCode(65 + list.children.length);
  const row = document.createElement("div");
  row.className = "member-row";
  row.innerHTML = `
    <label>姓名<input type="text" class="member-name" value="${nextName}" required></label>
    <label>個人消費金額<input type="number" class="member-expense" min="0" step="0.01" value="${expense}"></label>
    <label>已付款金額<input type="number" class="member-paid" min="0" step="0.01" value="${paid}"></label>
    <button type="button" class="btn ghost remove-btn">刪除此成員</button>
  `;
  row.querySelector(".remove-btn").addEventListener("click", () => {
    if (list.children.length <= 2) {
      setMessage("personalMessage", "成員至少需要保留 2 位。");
      return;
    }
    row.remove();
  });
  list.appendChild(row);
}

function getPersonalMembers() {
  return [...document.querySelectorAll("#personalMembers .member-row")].map((row) => ({
    name: row.querySelector(".member-name").value.trim(),
    expense: Number(row.querySelector(".member-expense").value),
    paid: Number(row.querySelector(".member-paid").value)
  }));
}

function calculatePersonal() {
  const members = getPersonalMembers();
  const servicePercent = readNumber("personalService");
  const discount = readNumber("personalDiscount");
  const mode = document.getElementById("personalRounding").value;

  if (members.length < 2) return setMessage("personalMessage", "成員至少需要 2 位。");
  if (members.some((member) => !member.name)) return setMessage("personalMessage", "姓名不可空白。");
  if (members.some((member) => !Number.isFinite(member.expense) || member.expense < 0 || !Number.isFinite(member.paid) || member.paid < 0)) {
    return setMessage("personalMessage", "金額不可空白或小於 0。");
  }
  if (servicePercent < 0) return setMessage("personalMessage", "服務費百分比不可小於 0。");

  const expenseTotal = members.reduce((sum, member) => sum + member.expense, 0);
  if (expenseTotal <= 0) return setMessage("personalMessage", "個人消費總額不可為 0。");

  const serviceTotal = expenseTotal * servicePercent / 100;
  if (discount < 0 || discount > expenseTotal + serviceTotal) {
    return setMessage("personalMessage", "折扣金額不可小於 0，也不可大於消費總額加服務費。");
  }

  const ratios = members.map((member) => member.expense / expenseTotal);
  const serviceShares = distributeByRawShares(ratios.map((ratio) => serviceTotal * ratio), serviceTotal, mode);
  const discountShares = distributeByRawShares(ratios.map((ratio) => discount * ratio), discount, mode);
  const finalTotal = expenseTotal + serviceTotal - discount;
  const payableShares = distributeByRawShares(
    members.map((member, index) => member.expense + serviceShares[index] - discountShares[index]),
    finalTotal,
    mode
  );

  const rows = members.map((member, index) => ({
    ...member,
    serviceShare: serviceShares[index],
    discountShare: discountShares[index],
    payable: payableShares[index],
    balance: Math.round((member.paid - payableShares[index]) * 100) / 100
  }));
  const transfers = settleDebts(rows);

  personalLineText = [
    "【多人花費結算結果】",
    "",
    `消費總額：${formatMoney(expenseTotal)}`,
    `服務費總額：${formatMoney(serviceTotal)}`,
    `折扣金額：${formatMoney(discount)}`,
    `最終總金額：${formatMoney(finalTotal)}`,
    "",
    "各成員狀態：",
    ...rows.map((row) => `${row.name}：${getStatus(row.balance).text}`),
    "",
    "轉帳建議：",
    ...(transfers.length ? transfers.map((transfer) => `${transfer.from} 給 ${transfer.to}：${formatMoney(transfer.amount)}`) : ["無需轉帳"])
  ].join("\n");

  document.getElementById("personalResult").innerHTML = `
    <div class="result-card">
      <h2>計算摘要</h2>
      ${buildSummary([
        { label: "消費總額", value: formatMoney(expenseTotal) },
        { label: "服務費總額", value: formatMoney(serviceTotal) },
        { label: "折扣金額", value: formatMoney(discount) },
        { label: "最終總金額", value: formatMoney(finalTotal) }
      ])}
    </div>
    <div class="result-card">
      <h2>每人消費明細</h2>
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>姓名</th><th>個人消費</th><th>服務費分攤</th><th>折扣分攤</th><th>實際應付</th><th>已付款</th><th>差額</th><th>狀態</th></tr>
          </thead>
          <tbody>
            ${rows.map((row) => {
              const status = getStatus(row.balance);
              return `
                <tr>
                  <td>${row.name}</td>
                  <td>${formatMoney(row.expense)}</td>
                  <td>${formatMoney(row.serviceShare)}</td>
                  <td>${formatMoney(row.discountShare)}</td>
                  <td>${formatMoney(row.payable)}</td>
                  <td>${formatMoney(row.paid)}</td>
                  <td>${formatMoney(row.balance)}</td>
                  <td class="${status.className}">${status.text}</td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      </div>
    </div>
    <div class="result-card">
      <h2>最少轉帳建議</h2>
      ${buildTransferList(transfers)}
    </div>
    <div class="result-card">
      <h2>LINE 結算文字</h2>
      <textarea class="line-text" readonly>${personalLineText}</textarea>
    </div>
  `;
  setMessage("personalMessage", "計算完成。", "success");
}

function fillPersonalExample() {
  const list = document.getElementById("personalMembers");
  list.innerHTML = "";
  addPersonalMember("A", 500, 1500);
  addPersonalMember("B", 300, 0);
  addPersonalMember("C", 200, 0);
  document.getElementById("personalService").value = 0;
  document.getElementById("personalDiscount").value = 0;
  document.getElementById("personalRounding").value = "round";
  document.getElementById("personalResult").innerHTML = "";
  personalLineText = "";
  setMessage("personalMessage", "已填入範例資料，可直接按開始計算。", "success");
}

function clearPersonal() {
  const list = document.getElementById("personalMembers");
  list.innerHTML = "";
  addPersonalMember("A", 0, 0);
  addPersonalMember("B", 0, 0);
  document.getElementById("personalService").value = 0;
  document.getElementById("personalDiscount").value = 0;
  document.getElementById("personalRounding").value = "round";
  document.getElementById("personalResult").innerHTML = "";
  personalLineText = "";
  setMessage("personalMessage", "已清除個人消費分攤資料。", "success");
}

function initSettlementPage() {
  document.getElementById("settlementAdd").addEventListener("click", () => addSettlementMember());
  document.getElementById("settlementCalculate").addEventListener("click", calculateSettlement);
  document.getElementById("settlementExample").addEventListener("click", fillSettlementExample);
  document.getElementById("settlementClear").addEventListener("click", clearSettlement);
  document.getElementById("settlementCopy").addEventListener("click", () => copyText(settlementLineText, "settlementMessage"));
  addSettlementMember("A", 0, 0);
  addSettlementMember("B", 0, 0);
}

function addSettlementMember(name = "", payable = 0, paid = 0) {
  const list = document.getElementById("settlementMembers");
  const nextName = name || String.fromCharCode(65 + list.children.length);
  const row = document.createElement("div");
  row.className = "member-row settlement";
  row.innerHTML = `
    <label>姓名<input type="text" class="member-name" value="${nextName}" required></label>
    <label>應付金額<input type="number" class="member-payable" min="0" step="0.01" value="${payable}"></label>
    <label>已付款金額<input type="number" class="member-paid" min="0" step="0.01" value="${paid}"></label>
    <button type="button" class="btn ghost remove-btn">刪除此成員</button>
  `;
  row.querySelector(".remove-btn").addEventListener("click", () => {
    if (list.children.length <= 2) {
      setMessage("settlementMessage", "成員至少需要保留 2 位。");
      return;
    }
    row.remove();
  });
  list.appendChild(row);
}

function getSettlementMembers() {
  return [...document.querySelectorAll("#settlementMembers .member-row")].map((row) => ({
    name: row.querySelector(".member-name").value.trim(),
    payable: Number(row.querySelector(".member-payable").value),
    paid: Number(row.querySelector(".member-paid").value)
  }));
}

function calculateSettlement() {
  const members = getSettlementMembers();
  if (members.length < 2) return setMessage("settlementMessage", "成員至少需要 2 位。");
  if (members.some((member) => !member.name)) return setMessage("settlementMessage", "姓名不可空白。");
  if (members.some((member) => !Number.isFinite(member.payable) || member.payable < 0 || !Number.isFinite(member.paid) || member.paid < 0)) {
    return setMessage("settlementMessage", "金額不可空白或小於 0。");
  }

  const totalPayable = members.reduce((sum, member) => sum + member.payable, 0);
  const totalPaid = members.reduce((sum, member) => sum + member.paid, 0);
  const difference = Math.round((totalPaid - totalPayable) * 100) / 100;
  const rows = members.map((member) => ({
    ...member,
    balance: Math.round((member.paid - member.payable) * 100) / 100
  }));
  const transfers = settleDebts(rows);
  const warning = Math.abs(difference) > 0.004
    ? "目前總應付金額與總已付款金額不同，請確認是否有漏記費用或輸入錯誤。"
    : "總應付金額與總已付款金額相同。";

  settlementLineText = [
    "【多人花費結算結果】",
    "",
    `總應付金額：${formatMoney(totalPayable)}`,
    `總已付款金額：${formatMoney(totalPaid)}`,
    "",
    "各成員狀態：",
    ...rows.map((row) => `${row.name}：${getStatus(row.balance).text}`),
    "",
    "轉帳建議：",
    ...(transfers.length ? transfers.map((transfer) => `${transfer.from} 給 ${transfer.to}：${formatMoney(transfer.amount)}`) : ["無需轉帳"])
  ].join("\n");

  document.getElementById("settlementResult").innerHTML = `
    <div class="result-card">
      <h2>結算摘要</h2>
      ${buildSummary([
        { label: "總應付金額", value: formatMoney(totalPayable) },
        { label: "總已付款金額", value: formatMoney(totalPaid) },
        { label: "差額檢查", value: formatMoney(difference) }
      ])}
      <p class="notice ${Math.abs(difference) > 0.004 ? "warning" : "ok"}">${warning}</p>
    </div>
    <div class="result-card">
      <h2>每人差額</h2>
      <div class="table-wrap">
        <table>
          <thead><tr><th>姓名</th><th>應付金額</th><th>已付款金額</th><th>差額</th><th>狀態</th></tr></thead>
          <tbody>
            ${rows.map((row) => {
              const status = getStatus(row.balance);
              return `
                <tr>
                  <td>${row.name}</td>
                  <td>${formatMoney(row.payable)}</td>
                  <td>${formatMoney(row.paid)}</td>
                  <td>${formatMoney(row.balance)}</td>
                  <td class="${status.className}">${status.text}</td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      </div>
    </div>
    <div class="result-card">
      <h2>最少轉帳建議</h2>
      ${buildTransferList(transfers)}
    </div>
    <div class="result-card">
      <h2>LINE 結算文字</h2>
      <textarea class="line-text" readonly>${settlementLineText}</textarea>
    </div>
  `;
  setMessage("settlementMessage", "結算完成。", "success");
}

function fillSettlementExample() {
  const list = document.getElementById("settlementMembers");
  list.innerHTML = "";
  addSettlementMember("A", 300, 1200);
  addSettlementMember("B", 300, 0);
  addSettlementMember("C", 300, 0);
  addSettlementMember("D", 300, 0);
  document.getElementById("settlementResult").innerHTML = "";
  settlementLineText = "";
  setMessage("settlementMessage", "已填入範例資料，可直接按開始結算。", "success");
}

function clearSettlement() {
  const list = document.getElementById("settlementMembers");
  list.innerHTML = "";
  addSettlementMember("A", 0, 0);
  addSettlementMember("B", 0, 0);
  document.getElementById("settlementResult").innerHTML = "";
  settlementLineText = "";
  setMessage("settlementMessage", "已清除多人付款結算資料。", "success");
}
