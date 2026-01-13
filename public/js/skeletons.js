/* =========================
   Skeletons
========================= */

function overviewSkeleton() {
  return `
    <div class="resultCard skeleton">
      <div class="sk-line w40"></div>
      <div class="sk-line w80"></div>
      <div class="sk-line w60"></div>
      <div class="sk-line w30"></div>
    </div>
  `;
}

function tableSkeletonTx(rows = 6) {
  return `
    <div class="tableWrap skeleton">
      <div class="tableScroll">
        <table>
          <thead>
            <tr><th>Tx</th><th>Age</th><th>From</th><th>To</th><th>Value</th></tr>
          </thead>
          <tbody>
            ${Array.from({ length: rows }).map(() => `
              <tr>
                <td><div class="sk-line w70"></div><div class="sk-line w40"></div></td>
                <td><div class="sk-line w40"></div></td>
                <td><div class="sk-line w50"></div></td>
                <td><div class="sk-line w50"></div></td>
                <td><div class="sk-line w30"></div></td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function tableSkeletonErc20(rows = 6) {
  return `
    <div class="tableWrap skeleton">
      <div class="tableScroll">
        <table>
          <thead>
            <tr><th>Tx</th><th>Age</th><th>Token</th><th>From</th><th>To</th><th>Amount</th></tr>
          </thead>
          <tbody>
            ${Array.from({ length: rows }).map(() => `
              <tr>
                <td><div class="sk-line w70"></div></td>
                <td><div class="sk-line w40"></div></td>
                <td><div class="sk-line w40"></div></td>
                <td><div class="sk-line w50"></div></td>
                <td><div class="sk-line w50"></div></td>
                <td><div class="sk-line w30"></div></td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function tableSkeletonInternal(rows = 6) {
  return `
    <div class="tableWrap skeleton">
      <div class="tableScroll">
        <table>
          <thead>
            <tr><th>Tx</th><th>Age</th><th>From</th><th>To</th><th>Type</th><th>Value</th></tr>
          </thead>
          <tbody>
            ${Array.from({ length: rows }).map(() => `
              <tr>
                <td><div class="sk-line w70"></div></td>
                <td><div class="sk-line w40"></div></td>
                <td><div class="sk-line w50"></div></td>
                <td><div class="sk-line w50"></div></td>
                <td><div class="sk-line w30"></div></td>
                <td><div class="sk-line w30"></div></td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function tableSkeletonNft(rows = 6) {
  return `
    <div class="tableWrap skeleton nft">
      <div class="tableScroll">
        <table>
          <thead>
            <tr>
              <th>Tx</th><th>Age</th><th>Std</th>
              <th>Collection</th><th>ID</th>
              <th>From</th><th>To</th>
            </tr>
          </thead>
          <tbody>
            ${Array.from({ length: rows }).map(() => `
              <tr>
                <td><div class="sk-line w70"></div></td>
                <td><div class="sk-line w40"></div></td>
                <td><div class="sk-line w30"></div></td>
                <td><div class="sk-line w50"></div></td>
                <td><div class="sk-line w30"></div></td>
                <td><div class="sk-line w50"></div></td>
                <td><div class="sk-line w50"></div></td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
}
