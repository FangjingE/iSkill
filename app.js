"use strict";

(function () {
  const API_STATE_ENDPOINT = "/api/state";
  const STORAGE_KEY = "iskills-skill-atlas-v2";
  const LEGACY_STORAGE_KEYS = ["iskills-skill-atlas-v1"];
  const PALETTE = ["#cf5b3f", "#14756a", "#d49a39", "#4f73b7", "#9b5c8a", "#6f8f2f"];
  const MAX_WEIGHT = 999999;
  const SVG_NS = "http://www.w3.org/2000/svg";

  const elements = {
    homeHero: document.getElementById("home-hero"),
    profileName: document.getElementById("profile-name"),
    profileRole: document.getElementById("profile-role"),
    profileGoal: document.getElementById("profile-goal"),
    skillCount: document.getElementById("skill-count"),
    leafCount: document.getElementById("leaf-count"),
    avgScore: document.getElementById("avg-score"),
    homeRadarChart: document.getElementById("home-radar-chart"),
    homeView: document.getElementById("home-view"),
    detailView: document.getElementById("detail-view"),
    detailContent: document.getElementById("detail-content"),
    detailMissingState: document.getElementById("detail-missing-state"),
    skillsGrid: document.getElementById("skills-grid"),
    skillEmptyState: document.getElementById("skill-empty-state"),
    addSkillForm: document.getElementById("add-skill-form"),
    restoreDemo: document.getElementById("restore-demo"),
    backHome: document.getElementById("back-home"),
    detailBreadcrumb: document.getElementById("detail-breadcrumb"),
    skillNameInput: document.getElementById("skill-name-input"),
    skillParentSelect: document.getElementById("skill-parent-select"),
    deleteCurrentSkill: document.getElementById("delete-current-skill"),
    skillAverage: document.getElementById("skill-average"),
    skillMaxDisplay: document.getElementById("skill-max-display"),
    skillChildDisplay: document.getElementById("skill-child-display"),
    radarChart: document.getElementById("radar-chart"),
    radarChartExpanded: document.getElementById("radar-chart-expanded"),
    expandRadar: document.getElementById("expand-radar"),
    radarModal: document.getElementById("radar-modal"),
    closeRadar: document.getElementById("close-radar"),
    skillMaxInput: document.getElementById("skill-max-input"),
    leafScoreInput: document.getElementById("leaf-score-input"),
    leafScoreIncrement: document.getElementById("leaf-score-increment"),
    leafScoreDecrement: document.getElementById("leaf-score-decrement"),
    leafScoreNote: document.getElementById("leaf-score-note"),
    skillNoteInput: document.getElementById("skill-note-input"),
    equalizeWeights: document.getElementById("equalize-weights"),
    addChildForm: document.getElementById("add-child-form"),
    childrenList: document.getElementById("children-list"),
    childEmptyState: document.getElementById("child-empty-state"),
  };

  let state = createSeedState();
  let selectedSkillId = null;
  let isHydrating = true;
  let pendingSaveController = null;

  bindEvents();
  syncSelectionFromHash();
  renderAll();
  initializeApp();

  async function initializeApp() {
    setSyncStatus("正在连接本地数据库...");
    state = await loadState();
    isHydrating = false;
    renderAll();
  }

  function bindEvents() {
    elements.profileName.addEventListener("input", () => {
      state.profile.name = elements.profileName.value.trimStart();
      saveState();
    });

    elements.profileRole.addEventListener("input", () => {
      state.profile.role = elements.profileRole.value.trimStart();
      saveState();
    });

    elements.profileGoal.addEventListener("input", () => {
      state.profile.goal = elements.profileGoal.value.trimStart();
      saveState();
    });

    elements.addSkillForm.elements.maxValue.addEventListener("input", () => {
      syncValueMax(elements.addSkillForm.elements.maxValue, elements.addSkillForm.elements.value, 0);
    });

    elements.addChildForm.elements.childMaxValue.addEventListener("input", () => {
      syncValueMax(
        elements.addChildForm.elements.childMaxValue,
        elements.addChildForm.elements.childValue,
        0,
      );
    });

    elements.addSkillForm.addEventListener("submit", (event) => {
      event.preventDefault();

      const formData = new FormData(elements.addSkillForm);
      const name = cleanText(formData.get("name"));
      const maxValue = clampNumber(formData.get("maxValue"), 1, 9999, 100);
      const value = clampNumber(formData.get("value"), 0, maxValue, 0);
      const children = splitSkillNames(formData.get("children")).map((childName) =>
        createSkill({ name: childName, maxValue, value: 0 }),
      );

      if (!name) {
        return;
      }

      const initialValue = children.length ? 0 : value;
      const skill = createSkill({ name, maxValue, value, weight: maxValue, children });
      skill.value = initialValue;
      state.skills.unshift(skill);
      saveState();
      elements.addSkillForm.reset();
      elements.addSkillForm.elements.maxValue.value = "100";
      elements.addSkillForm.elements.value.value = "0";
      selectSkill(skill.id);
      renderAll();
    });

    elements.restoreDemo.addEventListener("click", () => {
      const shouldRestore = window.confirm("恢复示例数据会覆盖当前本地记录，是否继续？");
      if (!shouldRestore) {
        return;
      }

      state = createSeedState();
      selectedSkillId = null;
      clearHash();
      saveState();
      renderAll();
    });

    elements.skillsGrid.addEventListener("click", (event) => {
      const target = event.target.closest("[data-action]");
      if (!target) {
        return;
      }

      const skillId = target.getAttribute("data-skill-id");
      if (!skillId) {
        return;
      }

      const action = target.getAttribute("data-action");
      if (action === "open-skill") {
        selectSkill(skillId);
        renderAll();
        return;
      }

      if (action === "delete-skill") {
        removeSkill(skillId);
      }
    });

    elements.backHome.addEventListener("click", () => {
      selectedSkillId = null;
      clearHash();
      renderAll();
    });

    elements.detailBreadcrumb.addEventListener("click", (event) => {
      const trigger = event.target.closest("[data-breadcrumb-id]");
      if (!trigger) {
        return;
      }

      const skillId = trigger.getAttribute("data-breadcrumb-id");
      if (!skillId) {
        return;
      }

      selectSkill(skillId);
      renderAll();
    });

    elements.deleteCurrentSkill.addEventListener("click", () => {
      if (!selectedSkillId) {
        return;
      }
      removeSkill(selectedSkillId);
    });

    elements.skillNameInput.addEventListener("change", () => {
      const skill = getSelectedSkill();
      if (!skill) {
        return;
      }

      const nextName = cleanText(elements.skillNameInput.value);
      if (!nextName) {
        elements.skillNameInput.value = skill.name;
        return;
      }

      skill.name = nextName;
      saveState();
      renderAll();
    });

    elements.skillMaxInput.addEventListener("change", () => {
      const skill = getSelectedSkill();
      if (!skill) {
        return;
      }

      skill.maxValue = clampNumber(elements.skillMaxInput.value, 1, 9999, skill.maxValue);
      clampTreeValues(skill);
      saveState();
      renderAll();
    });

    elements.skillParentSelect.addEventListener("change", () => {
      if (!selectedSkillId) {
        return;
      }

      const moved = moveSkill(selectedSkillId, cleanText(elements.skillParentSelect.value) || null);
      if (moved) {
        saveState();
      }
      renderAll();
    });

    elements.expandRadar.addEventListener("click", () => {
      const skill = getSelectedSkill();
      if (!skill) {
        return;
      }

      openRadarModal(skill);
    });

    elements.closeRadar.addEventListener("click", closeRadarModal);

    elements.radarModal.addEventListener("click", (event) => {
      const trigger = event.target.closest("[data-close-radar]");
      if (!trigger) {
        return;
      }
      closeRadarModal();
    });

    elements.leafScoreInput.addEventListener("change", () => {
      const skill = getSelectedSkill();
      if (!skill || skill.children.length) {
        return;
      }

      skill.value = clampNumber(elements.leafScoreInput.value, 0, skill.maxValue, skill.value);
      saveState();
      renderAll();
    });

    elements.leafScoreIncrement.addEventListener("click", () => {
      changeLeafScore(1);
    });

    elements.leafScoreDecrement.addEventListener("click", () => {
      changeLeafScore(-1);
    });

    elements.skillNoteInput.addEventListener("change", () => {
      const skill = getSelectedSkill();
      if (!skill) {
        return;
      }

      skill.note = cleanText(elements.skillNoteInput.value, 240);
      saveState();
      renderAll();
    });

    elements.equalizeWeights.addEventListener("click", () => {
      const skill = getSelectedSkill();
      if (!skill || !skill.children.length) {
        return;
      }

      applyWeightsFromMaxValue(skill.children);
      saveState();
      renderAll();
    });

    elements.addChildForm.addEventListener("submit", (event) => {
      event.preventDefault();

      const skill = getSelectedSkill();
      if (!skill) {
        return;
      }

      const formData = new FormData(elements.addChildForm);
      const name = cleanText(formData.get("childName"));
      const maxValue = clampNumber(formData.get("childMaxValue"), 1, 9999, 100);
      const value = clampNumber(formData.get("childValue"), 0, maxValue, 0);

      if (!name) {
        return;
      }

      if (!skill.children.length) {
        skill.value = 0;
      }
      skill.children.push(createSkill({ name, maxValue, value }));
      saveState();
      elements.addChildForm.reset();
      elements.addChildForm.elements.childMaxValue.value = "100";
      elements.addChildForm.elements.childValue.value = "0";
      renderAll();
    });

    elements.childrenList.addEventListener("click", (event) => {
      const target = event.target.closest("[data-child-action]");
      if (!target) {
        return;
      }

      const childId = target.getAttribute("data-child-id");
      if (!childId) {
        return;
      }

      const currentSkill = getSelectedSkill();
      if (!currentSkill) {
        return;
      }

      const child = currentSkill.children.find((item) => item.id === childId) || null;
      if (!child) {
        return;
      }

      const action = target.getAttribute("data-child-action");
      if (action === "open") {
        selectSkill(childId);
        renderAll();
        return;
      }

      if (action === "increment" && !child.children.length) {
        child.value = clampNumber(child.value + 1, 0, child.maxValue, child.value);
      } else if (action === "decrement" && !child.children.length) {
        child.value = clampNumber(child.value - 1, 0, child.maxValue, child.value);
      } else if (action === "delete") {
        const shouldDelete = window.confirm(`删除技能“${child.name}”吗？`);
        if (!shouldDelete) {
          return;
        }
        const parentScoreBeforeDelete = calculateScore(currentSkill);
        currentSkill.children = currentSkill.children.filter((item) => item.id !== childId);
        if (!currentSkill.children.length) {
          currentSkill.value = clampNumber(parentScoreBeforeDelete, 0, currentSkill.maxValue, 0);
        }
      }

      saveState();
      renderAll();
    });

    elements.childrenList.addEventListener("change", (event) => {
      const target = event.target;
      const childId = target.getAttribute("data-child-id");
      const field = target.getAttribute("data-child-field");

      if (!childId || !field) {
        return;
      }

      const currentSkill = getSelectedSkill();
      if (!currentSkill) {
        return;
      }

      const child = currentSkill.children.find((item) => item.id === childId) || null;
      if (!child) {
        return;
      }

      if (field === "name") {
        const nextName = cleanText(target.value);
        if (!nextName) {
          target.value = child.name;
          return;
        }
        child.name = nextName;
      }

      if (field === "share") {
        setChildShare(currentSkill.children, childId, target.value);
      }

      if (field === "maxValue") {
        child.maxValue = clampNumber(target.value, 1, 9999, child.maxValue);
        clampTreeValues(child);
      }

      if (field === "value" && !child.children.length) {
        child.value = clampNumber(target.value, 0, child.maxValue, child.value);
      }

      saveState();
      renderAll();
    });

    window.addEventListener("hashchange", () => {
      syncSelectionFromHash();
      renderAll();
    });

    window.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !elements.radarModal.hidden) {
        closeRadarModal();
      }
    });
  }

  function renderAll() {
    renderProfile();
    renderMetrics();
    renderHomeRadar();
    renderViewState();
    renderHome();
    renderDetail();
  }

  function renderProfile() {
    elements.profileName.value = state.profile.name;
    elements.profileRole.value = state.profile.role;
    elements.profileGoal.value = state.profile.goal;
  }

  function renderMetrics() {
    const allSkills = flattenSkills(state.skills);
    const rootCount = state.skills.length;
    const leafCount = allSkills.filter((skill) => !skill.children.length).length;
    const averagePercent = rootCount
      ? Math.round(state.skills.reduce((sum, skill) => sum + calculatePercent(skill), 0) / rootCount)
      : 0;

    elements.skillCount.textContent = String(allSkills.length);
    elements.leafCount.textContent = String(leafCount);
    elements.avgScore.textContent = `${averagePercent}%`;
  }

  function renderViewState() {
    const hasDetailRoute = isDetailRoute();
    const hasSelectedSkill = Boolean(getSelectedSkill());

    elements.homeHero.hidden = hasDetailRoute;
    elements.homeView.hidden = hasDetailRoute;
    elements.detailView.hidden = !hasDetailRoute;
    elements.detailContent.hidden = !hasDetailRoute || !hasSelectedSkill;
    elements.detailMissingState.hidden = !hasDetailRoute || hasSelectedSkill;

    if (!hasDetailRoute || !hasSelectedSkill) {
      closeRadarModal();
    }
  }

  function renderHome() {
    if (!state.skills.length) {
      elements.skillsGrid.innerHTML = "";
      elements.skillEmptyState.hidden = false;
      return;
    }

    elements.skillEmptyState.hidden = true;
    elements.skillsGrid.innerHTML = state.skills
      .map((skill, index) => {
        const score = calculateScore(skill);
        const percent = calculatePercent(skill);
        const childMarkup = skill.children.length
          ? skill.children
              .slice(0, 4)
              .map((child) => `<span class="chip">${escapeHtml(child.name)}</span>`)
              .join("")
          : '<span class="chip chip--muted">这是一个叶子技能</span>';

        return `
          <article class="skill-card reveal" style="--skill-color: ${skill.color}; --reveal-delay: ${index * 70}ms;">
            <div class="skill-card__head">
              <div>
                <p class="eyebrow">Skill</p>
                <h3>${escapeHtml(skill.name)}</h3>
              </div>
              <span class="score-pill">${formatNumber(score)} / ${skill.maxValue}</span>
            </div>

            <div class="progress-label">
              <span class="skill-card__meta">${skill.children.length} 个子技能</span>
              <strong>${percent}%</strong>
            </div>

            <div class="progress-bar">
              <span style="width: ${percent}%"></span>
            </div>

            <div class="chip-row">${childMarkup}</div>

            <div class="skill-card__actions">
              <button
                class="button button--secondary"
                type="button"
                data-action="open-skill"
                data-skill-id="${skill.id}"
              >
                进入技能页
              </button>
              <button
                class="button button--ghost"
                type="button"
                data-action="delete-skill"
                data-skill-id="${skill.id}"
              >
                删除
              </button>
            </div>
          </article>
        `;
      })
      .join("");
  }

  function renderHomeRadar() {
    if (!elements.homeRadarChart) {
      return;
    }

    if (!state.skills.length) {
      clearChart(elements.homeRadarChart);
      return;
    }

    const topLevelSkill = {
      id: "top-level-overview",
      name: "顶层技能总览",
      note: "",
      maxValue: 100,
      value: 0,
      color: "#14756a",
      weight: 1,
      children: state.skills.map((skill) => ({
        id: skill.id,
        name: skill.name,
        note: skill.note || "",
        maxValue: skill.maxValue,
        value: skill.value,
        color: skill.color,
        weight: skill.weight,
        children: skill.children,
      })),
    };

    renderRadar(topLevelSkill, elements.homeRadarChart);
  }

  function renderDetail() {
    const selectedNode = findSkillById(selectedSkillId);
    const skill = selectedNode ? selectedNode.skill : null;
    if (!skill) {
      elements.detailBreadcrumb.textContent = selectedSkillId ? "技能不存在" : "";
      return;
    }

    const score = calculateScore(skill);
    const path = findPathToSkill(selectedSkillId) || [];
    const parentId = selectedNode && selectedNode.parent ? selectedNode.parent.id : "";

    elements.detailBreadcrumb.innerHTML = renderBreadcrumb(path);
    elements.skillNameInput.value = skill.name;
    elements.skillParentSelect.innerHTML = renderParentOptions(skill.id, parentId);
    elements.skillMaxInput.value = String(skill.maxValue);
    elements.skillNoteInput.value = skill.note || "";
    elements.skillAverage.textContent = formatNumber(score);
    elements.skillMaxDisplay.textContent = String(skill.maxValue);
    elements.skillChildDisplay.textContent = String(skill.children.length);

    const isLeaf = !skill.children.length;
    elements.leafScoreInput.value = formatNumber(isLeaf ? skill.value : score);
    elements.leafScoreInput.max = String(skill.maxValue);
    elements.leafScoreInput.disabled = !isLeaf;
    elements.leafScoreIncrement.disabled = !isLeaf;
    elements.leafScoreDecrement.disabled = !isLeaf;
    elements.expandRadar.disabled = false;
    elements.leafScoreNote.textContent = isLeaf
      ? "叶子技能可以直接录入得分；父技能得分会由子技能自动加权计算。"
      : "当前技能已有子技能，因此这里的得分由子技能自动汇总，不能直接手动修改。";

    syncValueMax(
      elements.addChildForm.elements.childMaxValue,
      elements.addChildForm.elements.childValue,
      0,
    );
    renderRadar(skill, elements.radarChart);
    if (!elements.radarModal.hidden) {
      updateExpandedRadar(skill);
    }
    renderChildren(skill);
  }

  function renderChildren(skill) {
    if (!skill.children.length) {
      elements.childrenList.innerHTML = "";
      elements.childEmptyState.hidden = false;
      return;
    }

    elements.childEmptyState.hidden = true;
    elements.childrenList.innerHTML = skill.children
      .map((child) => {
        const share = calculateWeightShare(child, skill.children);
        const score = calculateScore(child);
        const percent = calculatePercent(child);
        const childType = child.children.length ? `${child.children.length} 个子技能` : "叶子技能";
        const scoreControl = child.children.length
          ? `<p class="branch-share">该技能已有子技能，得分会自动汇总。</p>`
          : `
              <div class="stepper">
                <button type="button" data-child-action="decrement" data-child-id="${child.id}">-</button>
                <input
                  type="number"
                  min="0"
                  max="${child.maxValue}"
                  step="1"
                  value="${formatNumber(child.value)}"
                  data-child-id="${child.id}"
                  data-child-field="value"
                />
                <button type="button" data-child-action="increment" data-child-id="${child.id}">+</button>
              </div>
            `;

        return `
          <article class="branch-card">
            <div class="branch-card__header">
              <div>
                <p class="eyebrow">Child Skill</p>
                <h4>${escapeHtml(child.name)}</h4>
              </div>
              <span class="score-pill">${formatNumber(score)} / ${child.maxValue}</span>
            </div>

            <div class="branch-metadata">
              <label class="field">
                <span>技能名称</span>
                <input
                  type="text"
                  maxlength="30"
                  value="${escapeAttribute(child.name)}"
                  data-child-id="${child.id}"
                  data-child-field="name"
                />
              </label>

              <label class="field">
                <span>技能上限</span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value="${formatNumber(child.maxValue)}"
                  data-child-id="${child.id}"
                  data-child-field="maxValue"
                />
              </label>

              <article class="mini-card">
                <strong>${percent}%</strong>
                <span>${childType}</span>
              </article>
            </div>

            <div class="branch-controls">
              ${scoreControl}

              <label class="field field--small">
                <span>权重占比</span>
                <div class="input-suffix">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value="${formatNumber(share)}"
                    data-child-id="${child.id}"
                    data-child-field="share"
                    ${skill.children.length === 1 ? "disabled" : ""}
                  />
                  <span>%</span>
                </div>
              </label>

              <button
                class="button button--secondary"
                type="button"
                data-child-action="open"
                data-child-id="${child.id}"
              >
                进入子技能
              </button>

              <button
                class="button button--ghost"
                type="button"
                data-child-action="delete"
                data-child-id="${child.id}"
              >
                删除技能
              </button>
            </div>
          </article>
        `;
      })
      .join("");
  }

  function renderRadar(skill, chartElement) {
    const config = getRadarRenderConfig(chartElement);
    const centerX = config.size / 2;
    const centerY = config.size / 2;

    chartElement.setAttribute("viewBox", `0 0 ${config.size} ${config.size}`);

    while (chartElement.firstChild) {
      chartElement.removeChild(chartElement.firstChild);
    }

    const title = document.createElementNS(SVG_NS, "title");
    title.textContent = `${skill.name} 雷达图`;
    chartElement.appendChild(title);

    if (!skill.children.length) {
      const radius = config.leafRadius;
      const percent = calculatePercent(skill);

      const baseRing = document.createElementNS(SVG_NS, "circle");
      baseRing.setAttribute("cx", String(centerX));
      baseRing.setAttribute("cy", String(centerY));
      baseRing.setAttribute("r", String(radius));
      baseRing.setAttribute("fill", "rgba(20, 117, 106, 0.05)");
      baseRing.setAttribute("stroke", "rgba(22, 48, 74, 0.12)");
      baseRing.setAttribute("stroke-width", String(config.ringWidth));

      const progressRing = document.createElementNS(SVG_NS, "circle");
      progressRing.setAttribute("cx", String(centerX));
      progressRing.setAttribute("cy", String(centerY));
      progressRing.setAttribute("r", String(radius));
      progressRing.setAttribute("fill", "none");
      progressRing.setAttribute("stroke", skill.color);
      progressRing.setAttribute("stroke-width", String(config.ringWidth));
      progressRing.setAttribute("stroke-linecap", "round");
      progressRing.setAttribute("transform", `rotate(-90 ${centerX} ${centerY})`);
      const circumference = 2 * Math.PI * radius;
      progressRing.setAttribute("stroke-dasharray", `${circumference}`);
      progressRing.setAttribute("stroke-dashoffset", `${circumference * (1 - percent / 100)}`);

      const scoreText = document.createElementNS(SVG_NS, "text");
      scoreText.setAttribute("x", String(centerX));
      scoreText.setAttribute("y", String(centerY - config.leafScoreYOffset));
      scoreText.setAttribute("text-anchor", "middle");
      scoreText.setAttribute("font-size", String(config.leafScoreFontSize));
      scoreText.setAttribute("fill", "#16304a");
      scoreText.textContent = `${percent}%`;

      const label = document.createElementNS(SVG_NS, "text");
      label.setAttribute("x", String(centerX));
      label.setAttribute("y", String(centerY + config.leafLabelYOffset));
      label.setAttribute("text-anchor", "middle");
      label.setAttribute("font-size", String(config.leafLabelFontSize));
      label.setAttribute("fill", "#607184");
      label.textContent = `叶子技能得分 ${formatNumber(skill.value)} / ${skill.maxValue}`;

      chartElement.append(baseRing, progressRing, scoreText, label);
      return;
    }

    const radius = config.radarRadius;
    const layerCount = 5;
    const angleStep = (Math.PI * 2) / skill.children.length;
    const startAngle = -Math.PI / 2;
    const gradientId = `radar-gradient-${skill.id}`;

    const defs = document.createElementNS(SVG_NS, "defs");
    const gradient = document.createElementNS(SVG_NS, "linearGradient");
    gradient.setAttribute("id", gradientId);
    gradient.setAttribute("x1", "0%");
    gradient.setAttribute("x2", "100%");
    gradient.setAttribute("y1", "0%");
    gradient.setAttribute("y2", "100%");

    const stopA = document.createElementNS(SVG_NS, "stop");
    stopA.setAttribute("offset", "0%");
    stopA.setAttribute("stop-color", skill.color);
    stopA.setAttribute("stop-opacity", "0.45");

    const stopB = document.createElementNS(SVG_NS, "stop");
    stopB.setAttribute("offset", "100%");
    stopB.setAttribute("stop-color", "#f8c988");
    stopB.setAttribute("stop-opacity", "0.2");

    gradient.append(stopA, stopB);
    defs.appendChild(gradient);
    chartElement.appendChild(defs);

    for (let layer = layerCount; layer >= 1; layer -= 1) {
      const scale = layer / layerCount;
      const polygon = document.createElementNS(SVG_NS, "polygon");
      polygon.setAttribute(
        "points",
        buildPolygonPoints(skill.children.length, scale, radius, centerX, centerY, startAngle, angleStep),
      );
      polygon.setAttribute("fill", layer % 2 === 0 ? "rgba(20, 117, 106, 0.05)" : "rgba(212, 154, 57, 0.05)");
      polygon.setAttribute("stroke", "rgba(22, 48, 74, 0.12)");
      polygon.setAttribute("stroke-width", "1");
      chartElement.appendChild(polygon);
    }

    skill.children.forEach((child, index) => {
      const angle = startAngle + index * angleStep;
      const [x, y] = pointFor(angle, radius, 1, centerX, centerY);

      const axis = document.createElementNS(SVG_NS, "line");
      axis.setAttribute("x1", String(centerX));
      axis.setAttribute("y1", String(centerY));
      axis.setAttribute("x2", String(x));
      axis.setAttribute("y2", String(y));
      axis.setAttribute("stroke", "rgba(22, 48, 74, 0.16)");
      axis.setAttribute("stroke-width", "1");
      chartElement.appendChild(axis);

      const [labelX, labelY] = pointFor(angle, radius + config.labelOffset, 1, centerX, centerY);
      const label = document.createElementNS(SVG_NS, "text");
      label.setAttribute("x", String(labelX));
      label.setAttribute("y", String(labelY));
      label.setAttribute("font-size", String(config.labelFontSize));
      label.setAttribute("fill", "#16304a");
      label.setAttribute("text-anchor", labelAnchor(labelX, centerX));

      const nameLine = document.createElementNS(SVG_NS, "tspan");
      nameLine.setAttribute("x", String(labelX));
      nameLine.textContent = shortenLabel(child.name, config.labelLimit);

      const statLine = document.createElementNS(SVG_NS, "tspan");
      statLine.setAttribute("x", String(labelX));
      statLine.setAttribute("dy", String(config.labelLineGap));
      statLine.setAttribute("fill", "#607184");
      statLine.textContent = `${formatNumber(calculateScore(child))} / ${child.maxValue}`;

      label.append(nameLine, statLine);
      chartElement.appendChild(label);
    });

    const valuePolygon = document.createElementNS(SVG_NS, "polygon");
    valuePolygon.setAttribute(
      "points",
      buildValuePoints(skill.children, radius, centerX, centerY, startAngle, angleStep),
    );
    valuePolygon.setAttribute("fill", `url(#${gradientId})`);
    valuePolygon.setAttribute("stroke", skill.color);
    valuePolygon.setAttribute("stroke-width", String(config.polygonStrokeWidth));
    chartElement.appendChild(valuePolygon);

    skill.children.forEach((child, index) => {
      const angle = startAngle + index * angleStep;
      const scale = child.maxValue ? calculateScore(child) / child.maxValue : 0;
      const [x, y] = pointFor(angle, radius, scale, centerX, centerY);

      const point = document.createElementNS(SVG_NS, "circle");
      point.setAttribute("cx", String(x));
      point.setAttribute("cy", String(y));
      point.setAttribute("r", String(config.pointRadius));
      point.setAttribute("fill", skill.color);
      point.setAttribute("stroke", "#fffaf5");
      point.setAttribute("stroke-width", "2");
      chartElement.appendChild(point);
    });
  }

  function clearChart(chartElement) {
    while (chartElement.firstChild) {
      chartElement.removeChild(chartElement.firstChild);
    }
  }

  function getRadarRenderConfig(chartElement) {
    if (chartElement === elements.homeRadarChart) {
      return {
        size: 520,
        leafRadius: 108,
        ringWidth: 16,
        leafScoreFontSize: 40,
        leafScoreYOffset: 10,
        leafLabelYOffset: 24,
        leafLabelFontSize: 15,
        radarRadius: 122,
        labelOffset: 38,
        labelFontSize: 12,
        labelLineGap: 16,
        labelLimit: 8,
        polygonStrokeWidth: 3,
        pointRadius: 4.5,
      };
    }

    if (chartElement === elements.radarChartExpanded) {
      return {
        size: 640,
        leafRadius: 148,
        ringWidth: 22,
        leafScoreFontSize: 58,
        leafScoreYOffset: 18,
        leafLabelYOffset: 28,
        leafLabelFontSize: 18,
        radarRadius: 150,
        labelOffset: 54,
        labelFontSize: 14,
        labelLineGap: 18,
        labelLimit: 8,
        polygonStrokeWidth: 4,
        pointRadius: 5.5,
      };
    }

    return {
      size: 520,
      leafRadius: 112,
      ringWidth: 18,
      leafScoreFontSize: 44,
      leafScoreYOffset: 10,
      leafLabelYOffset: 26,
      leafLabelFontSize: 16,
      radarRadius: 126,
      labelOffset: 42,
      labelFontSize: 12,
      labelLineGap: 16,
      labelLimit: 8,
      polygonStrokeWidth: 3,
      pointRadius: 4.5,
    };
  }

  function openRadarModal(skill) {
    elements.radarModal.hidden = false;
    updateExpandedRadar(skill);
  }

  function closeRadarModal() {
    elements.radarModal.hidden = true;
  }

  function updateExpandedRadar(skill) {
    const modalTitle = document.getElementById("radar-modal-title");
    modalTitle.textContent = `${skill.name} 雷达图`;
    renderRadar(skill, elements.radarChartExpanded);
  }

  function renderBreadcrumb(path) {
    if (!path.length) {
      return "";
    }

    return path
      .map((skill, index) => {
        const isLast = index === path.length - 1;
        if (isLast) {
          return `<span class="breadcrumb-current">${escapeHtml(skill.name)}</span>`;
        }
        return `
          <button
            type="button"
            class="breadcrumb-link"
            data-breadcrumb-id="${skill.id}"
          >
            ${escapeHtml(skill.name)}
          </button>
        `;
      })
      .join('<span class="breadcrumb-sep">/</span>');
  }

  function renderParentOptions(skillId, selectedParentId) {
    const currentNode = findSkillById(skillId);
    if (!currentNode) {
      return '<option value="">设为顶级技能</option>';
    }

    const blockedIds = new Set(flattenSkills([currentNode.skill]).map((item) => item.id));
    const parentChoices = buildParentChoices(state.skills, [], blockedIds);
    const topLevelSelected = selectedParentId ? "" : " selected";

    return [
      `<option value=""${topLevelSelected}>设为顶级技能</option>`,
      ...parentChoices.map((choice) => {
        const isSelected = choice.id === selectedParentId ? " selected" : "";
        return `<option value="${escapeAttribute(choice.id)}"${isSelected}>${escapeHtml(choice.label)}</option>`;
      }),
    ].join("");
  }

  function buildParentChoices(skills, trail, blockedIds) {
    return skills.flatMap((skill) => {
      if (blockedIds.has(skill.id)) {
        return [];
      }

      const nextTrail = [...trail, skill];
      return [
        {
          id: skill.id,
          label: nextTrail.map((item) => item.name).join(" / "),
        },
        ...buildParentChoices(skill.children, nextTrail, blockedIds),
      ];
    });
  }

  function removeSkill(skillId) {
    const node = findSkillById(skillId);
    if (!node) {
      return;
    }

    const shouldDelete = window.confirm(`删除技能“${node.skill.name}”吗？`);
    if (!shouldDelete) {
      return;
    }

    if (node.parent) {
      const parentScoreBeforeDelete = calculateScore(node.parent);
      node.parent.children = node.parent.children.filter((item) => item.id !== skillId);
      if (!node.parent.children.length) {
        node.parent.value = clampNumber(parentScoreBeforeDelete, 0, node.parent.maxValue, 0);
      }
    } else {
      state.skills = state.skills.filter((item) => item.id !== skillId);
    }

    if (selectedSkillId === skillId) {
      const fallbackId = node.parent ? node.parent.id : null;
      selectedSkillId = fallbackId;
      if (fallbackId) {
        window.location.hash = `skill/${fallbackId}`;
      } else {
        clearHash();
      }
    }

    saveState();
    renderAll();
  }

  function selectSkill(skillId) {
    selectedSkillId = skillId;
    window.location.hash = `skill/${skillId}`;
  }

  function moveSkill(skillId, nextParentId) {
    const node = findSkillById(skillId);
    if (!node) {
      return false;
    }

    const currentParentId = node.parent ? node.parent.id : "";
    const targetParentId = cleanText(nextParentId) || "";
    if (targetParentId === currentParentId) {
      return false;
    }

    const blockedIds = new Set(flattenSkills([node.skill]).map((item) => item.id));
    if (targetParentId && blockedIds.has(targetParentId)) {
      return false;
    }

    const targetParentNode = targetParentId ? findSkillById(targetParentId) : null;
    if (targetParentId && !targetParentNode) {
      return false;
    }

    detachSkill(node);
    attachSkill(node.skill, targetParentNode ? targetParentNode.skill : null);
    return true;
  }

  function getSelectedSkill() {
    const node = findSkillById(selectedSkillId);
    return node ? node.skill : null;
  }

  function findSkillById(skillId, skills = state.skills, parent = null) {
    for (const skill of skills) {
      if (skill.id === skillId) {
        return { skill, parent };
      }
      const found = findSkillById(skillId, skill.children, skill);
      if (found) {
        return found;
      }
    }
    return null;
  }

  function findPathToSkill(skillId, skills = state.skills, trail = []) {
    for (const skill of skills) {
      const nextTrail = [...trail, skill];
      if (skill.id === skillId) {
        return nextTrail;
      }
      const found = findPathToSkill(skillId, skill.children, nextTrail);
      if (found) {
        return found;
      }
    }
    return null;
  }

  function syncSelectionFromHash() {
    const hash = window.location.hash.replace(/^#/, "");
    const match = hash.match(/^skill\/(.+)$/);
    selectedSkillId = match ? match[1] : null;
  }

  function isDetailRoute() {
    return /^skill\/.+$/.test(window.location.hash.replace(/^#/, ""));
  }

  function clearHash() {
    history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
  }

  async function loadState() {
    try {
      const response = await fetch(API_STATE_ENDPOINT, {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(`Failed to load state: ${response.status}`);
      }

      const payload = await response.json();
      if (payload && payload.state) {
        setSyncStatus("已连接本地 SQLite");
        return normalizeState(payload.state);
      }

      const localState = loadLocalState();
      if (localState) {
        await persistState(localState);
        clearLocalState();
        setSyncStatus("已迁移旧数据到本地 SQLite");
        return normalizeState(localState);
      }

      const seedState = createSeedState();
      await persistState(seedState);
      setSyncStatus("已连接本地 SQLite");
      return seedState;
    } catch (error) {
      setSyncStatus("数据库暂时不可用，当前使用临时内存数据");
      return loadLocalState() || createSeedState();
    }
  }

  function saveState() {
    if (isHydrating) {
      return;
    }

    persistState(state).catch(() => {
      setSyncStatus("保存失败，请确认本地 Python 服务正在运行");
    });
  }

  function loadLocalState() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        return normalizeState(JSON.parse(raw));
      }

      for (const legacyKey of LEGACY_STORAGE_KEYS) {
        const legacyRaw = window.localStorage.getItem(legacyKey);
        if (legacyRaw) {
          const migrated = migrateLegacyState(JSON.parse(legacyRaw));
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
          return normalizeState(migrated);
        }
      }
    } catch (error) {
      return null;
    }

    return null;
  }

  function clearLocalState() {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
      LEGACY_STORAGE_KEYS.forEach((legacyKey) => window.localStorage.removeItem(legacyKey));
    } catch (error) {
      return;
    }
  }

  async function persistState(nextState) {
    if (pendingSaveController) {
      pendingSaveController.abort();
    }

    const controller = new AbortController();
    pendingSaveController = controller;
    setSyncStatus("正在保存到本地 SQLite...");

    try {
      const response = await fetch(API_STATE_ENDPOINT, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ state: nextState }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Failed to save state: ${response.status}`);
      }

      setSyncStatus("数据已保存到本地 SQLite");
    } catch (error) {
      if (error && error.name === "AbortError") {
        return;
      }
      throw error;
    } finally {
      if (pendingSaveController === controller) {
        pendingSaveController = null;
      }
    }
  }

  function setSyncStatus(message) {
    return message;
  }

  function createSeedState() {
    return normalizeState({
      profile: {
        name: "林澈",
        role: "个人成长玩家",
        goal: "把模糊的努力拆成看得见的技能树，并持续升级关键技能。",
      },
      skills: [
        {
          id: uid("skill"),
          name: "计算机能力",
          note: "优先补工程化和系统设计，让输出更稳定。",
          maxValue: 100,
          value: 0,
          color: PALETTE[0],
          weight: 1,
          children: [
            createSkill({ name: "工程化能力", value: 74, maxValue: 100, weight: 1.3 }),
            createSkill({ name: "理论知识", value: 61, maxValue: 100, weight: 1 }),
            {
              ...createSkill({ name: "系统设计", value: 0, maxValue: 100, weight: 1.2 }),
              children: [
                createSkill({ name: "架构建模", value: 71, maxValue: 100, weight: 1 }),
                createSkill({ name: "性能权衡", value: 64, maxValue: 100, weight: 1 }),
              ],
            },
            createSkill({ name: "调试能力", value: 79, maxValue: 100, weight: 1.1 }),
          ],
        },
        {
          id: uid("skill"),
          name: "英语",
          note: "口语和听力优先，读写保持节奏。",
          maxValue: 100,
          value: 0,
          color: PALETTE[1],
          weight: 1,
          children: [
            createSkill({ name: "听", value: 65, maxValue: 100, weight: 1.2 }),
            createSkill({ name: "说", value: 46, maxValue: 100, weight: 1.4 }),
            createSkill({ name: "读", value: 81, maxValue: 100, weight: 1 }),
            createSkill({ name: "写", value: 57, maxValue: 100, weight: 1 }),
          ],
        },
        {
          id: uid("skill"),
          name: "表达与输出",
          note: "训练结构化表达，让观点更清晰。",
          maxValue: 100,
          value: 0,
          color: PALETTE[2],
          weight: 1,
          children: [
            createSkill({ name: "即兴表达", value: 54, maxValue: 100, weight: 1.1 }),
            createSkill({ name: "写作组织", value: 71, maxValue: 100, weight: 1.2 }),
            createSkill({ name: "演示呈现", value: 49, maxValue: 100, weight: 1 }),
          ],
        },
      ],
    });
  }

  function migrateLegacyState(legacyState) {
    const rawSkills = Array.isArray(legacyState && legacyState.skills) ? legacyState.skills : [];
    return {
      profile: legacyState && legacyState.profile ? legacyState.profile : {},
      skills: rawSkills.map((legacySkill, index) => ({
        id: cleanText(legacySkill && legacySkill.id) || uid("skill"),
        name: cleanText(legacySkill && legacySkill.name) || `技能 ${index + 1}`,
        note: cleanText(legacySkill && legacySkill.note, 240),
        maxValue: clampNumber(legacySkill && legacySkill.maxValue, 1, 9999, 100),
        value: 0,
        color: cleanText(legacySkill && legacySkill.color) || pickColor(legacySkill && legacySkill.name),
        weight: clampNumber(legacySkill && legacySkill.maxValue, 0, MAX_WEIGHT, 100),
        children: Array.isArray(legacySkill && legacySkill.branches)
          ? legacySkill.branches.map((branch) => ({
              id: cleanText(branch && branch.id) || uid("skill"),
              name: cleanText(branch && branch.name) || "未命名技能",
              note: "",
              maxValue: clampNumber(legacySkill && legacySkill.maxValue, 1, 9999, 100),
              value: clampNumber(branch && branch.value, 0, clampNumber(legacySkill && legacySkill.maxValue, 1, 9999, 100), 0),
              color: cleanText(legacySkill && legacySkill.color) || pickColor(branch && branch.name),
              weight: clampNumber(branch && branch.weight, 0, MAX_WEIGHT, clampNumber(legacySkill && legacySkill.maxValue, 1, 9999, 100)),
              children: [],
            }))
          : [],
      })),
    };
  }

  function normalizeState(rawState) {
    const safeProfile = rawState && typeof rawState === "object" ? rawState.profile || {} : {};
    const rawSkills = Array.isArray(rawState && rawState.skills) ? rawState.skills : [];

    return {
      profile: {
        name: cleanText(safeProfile.name) || "我的角色",
        role: cleanText(safeProfile.role) || "成长中的多面手",
        goal: cleanText(safeProfile.goal, 200) || "把技能拆成子技能，让成长有结构。",
      },
      skills: rawSkills.map((skill, index) => normalizeSkill(skill, index)),
    };
  }

  function normalizeSkill(skill, index) {
    const name = cleanText(skill && skill.name) || `技能 ${index + 1}`;
    const maxValue = clampNumber(skill && skill.maxValue, 1, 9999, 100);
    const rawChildren = Array.isArray(skill && skill.children)
      ? skill.children
      : Array.isArray(skill && skill.branches)
        ? skill.branches
        : [];
    const hasChildren = rawChildren.length > 0;
    const children = rawChildren.map((child, childIndex) => normalizeSkill(child, childIndex));

    return {
      id: cleanText(skill && skill.id) || uid("skill"),
      name,
      note: cleanText(skill && skill.note, 240),
      maxValue,
      value: hasChildren ? 0 : clampNumber(skill && skill.value, 0, maxValue, 0),
      color: cleanText(skill && skill.color) || pickColor(name),
      weight: clampNumber(skill && skill.weight, 0, MAX_WEIGHT, getDefaultWeightFromMaxValue({ maxValue })),
      children,
    };
  }

  function createSkill({ name, maxValue, value, weight, children }) {
    const normalizedChildren = Array.isArray(children) ? children : [];
    return {
      id: uid("skill"),
      name,
      note: "",
      maxValue,
      value: normalizedChildren.length ? 0 : clampNumber(value, 0, maxValue, 0),
      color: pickColor(name),
      weight: clampNumber(weight, 0, MAX_WEIGHT, getDefaultWeightFromMaxValue({ maxValue })),
      children: normalizedChildren,
    };
  }

  function calculateScore(skill) {
    if (!skill.children.length) {
      return clampNumber(skill.value, 0, skill.maxValue, 0);
    }

    const totalWeight = getTotalWeight(skill.children);
    const weightedScore = skill.children.reduce((sum, child) => {
      const childPercent = child.maxValue ? calculateScore(child) / child.maxValue : 0;
      return sum + childPercent * getEffectiveWeight(child, skill.children);
    }, 0);

    return totalWeight ? Math.min(skill.maxValue, (weightedScore / totalWeight) * skill.maxValue) : 0;
  }

  function calculatePercent(skill) {
    if (!skill.maxValue) {
      return 0;
    }
    return Math.round((calculateScore(skill) / skill.maxValue) * 100);
  }

  function getTotalWeight(children) {
    if (!children.length) {
      return 0;
    }

    const positiveTotal = children.reduce((sum, child) => sum + Math.max(0, Number(child.weight) || 0), 0);
    if (positiveTotal > 0) {
      return positiveTotal;
    }
    return children.reduce((sum, child) => sum + getDefaultWeightFromMaxValue(child), 0);
  }

  function getEffectiveWeight(skill, siblings) {
    const positiveTotal = siblings.reduce((sum, item) => sum + Math.max(0, Number(item.weight) || 0), 0);
    if (positiveTotal > 0) {
      return Math.max(0, Number(skill.weight) || 0);
    }
    return getDefaultWeightFromMaxValue(skill);
  }

  function calculateWeightShare(skill, siblings) {
    const totalWeight = getTotalWeight(siblings);
    if (!totalWeight) {
      return 0;
    }
    return (getEffectiveWeight(skill, siblings) / totalWeight) * 100;
  }

  function setChildShare(children, childId, nextShareValue) {
    const child = children.find((item) => item.id === childId) || null;
    if (!child || children.length <= 1) {
      return;
    }

    const siblings = children.filter((item) => item.id !== childId);
    const desiredShare = clampNumber(nextShareValue, 0, 100, calculateWeightShare(child, children));

    if (desiredShare >= 100) {
      siblings.forEach((item) => {
        item.weight = 0;
      });
      child.weight = Math.max(1, Number(child.weight) || 0);
      return;
    }

    if (desiredShare <= 0) {
      child.weight = 0;
      if (!siblings.some((item) => Math.max(0, Number(item.weight) || 0) > 0)) {
        applyWeightsFromMaxValue(siblings);
      }
      rescaleWeights(children);
      return;
    }

    let otherTotal = siblings.reduce((sum, item) => sum + Math.max(0, Number(item.weight) || 0), 0);
    if (otherTotal <= 0) {
      applyWeightsFromMaxValue(siblings);
      otherTotal = siblings.reduce((sum, item) => sum + Math.max(0, Number(item.weight) || 0), 0);
    }

    child.weight = (otherTotal * desiredShare) / (100 - desiredShare);
    rescaleWeights(children);
  }

  function applyWeightsFromMaxValue(children) {
    children.forEach((child) => {
      child.weight = getDefaultWeightFromMaxValue(child);
    });
    rescaleWeights(children);
  }

  function getDefaultWeightFromMaxValue(skill) {
    const maxValue = Math.max(0, Number(skill && skill.maxValue) || 0);
    return maxValue || 1;
  }

  function rescaleWeights(children) {
    const maxWeight = children.reduce((max, child) => Math.max(max, Math.max(0, Number(child.weight) || 0)), 0);
    if (!maxWeight || maxWeight <= MAX_WEIGHT) {
      return;
    }

    const factor = MAX_WEIGHT / maxWeight;
    children.forEach((child) => {
      child.weight = Number((Math.max(0, Number(child.weight) || 0) * factor).toFixed(4));
    });
  }

  function clampTreeValues(skill) {
    skill.value = clampNumber(skill.value, 0, skill.maxValue, 0);
    skill.children.forEach((child) => {
      clampTreeValues(child);
    });
  }

  function detachSkill(node) {
    if (node.parent) {
      const parentScoreBeforeMove = calculateScore(node.parent);
      node.parent.children = node.parent.children.filter((item) => item.id !== node.skill.id);
      if (!node.parent.children.length) {
        node.parent.value = clampNumber(parentScoreBeforeMove, 0, node.parent.maxValue, 0);
      }
      return;
    }

    state.skills = state.skills.filter((item) => item.id !== node.skill.id);
  }

  function attachSkill(skill, parent) {
    if (!parent) {
      state.skills.unshift(skill);
      return;
    }

    if (!parent.children.length) {
      parent.value = 0;
    }
    parent.children.push(skill);
  }

  function changeLeafScore(delta) {
    const skill = getSelectedSkill();
    if (!skill || skill.children.length) {
      return;
    }

    skill.value = clampNumber(skill.value + delta, 0, skill.maxValue, skill.value);
    saveState();
    renderAll();
  }

  function flattenSkills(skills) {
    return skills.flatMap((skill) => [skill, ...flattenSkills(skill.children)]);
  }

  function splitSkillNames(value) {
    return String(value || "")
      .split(/[，、,\s]+/u)
      .map((item) => cleanText(item))
      .filter(Boolean);
  }

  function syncValueMax(maxInput, valueInput, min) {
    const maxValue = clampNumber(maxInput.value, 1, 9999, 100);
    valueInput.max = String(maxValue);
    valueInput.value = String(clampNumber(valueInput.value, min, maxValue, min));
  }

  function cleanText(value, maxLength) {
    const text = String(value || "").replace(/\s+/g, " ").trim();
    if (!maxLength) {
      return text;
    }
    return text.slice(0, maxLength);
  }

  function clampNumber(value, min, max, fallback) {
    const numeric = Number(value);
    if (Number.isNaN(numeric)) {
      return fallback;
    }
    return Math.min(max, Math.max(min, numeric));
  }

  function uid(prefix) {
    return `${prefix}-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
  }

  function pickColor(seed) {
    let hash = 0;
    const input = String(seed || "");
    for (let index = 0; index < input.length; index += 1) {
      hash = (hash << 5) - hash + input.charCodeAt(index);
      hash |= 0;
    }
    return PALETTE[Math.abs(hash) % PALETTE.length];
  }

  function formatNumber(value) {
    const rounded = Number(value);
    if (Math.abs(rounded - Math.round(rounded)) < 0.05) {
      return String(Math.round(rounded));
    }
    return rounded.toFixed(1);
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function escapeAttribute(value) {
    return escapeHtml(value).replaceAll("`", "&#96;");
  }

  function shortenLabel(value, limit) {
    const text = String(value || "");
    if (text.length <= limit) {
      return text;
    }
    return `${text.slice(0, limit)}…`;
  }

  function buildPolygonPoints(count, scale, radius, centerX, centerY, startAngle, angleStep) {
    return Array.from({ length: count }, (_, index) => {
      const angle = startAngle + index * angleStep;
      const [x, y] = pointFor(angle, radius, scale, centerX, centerY);
      return `${x},${y}`;
    }).join(" ");
  }

  function buildValuePoints(children, radius, centerX, centerY, startAngle, angleStep) {
    return children
      .map((child, index) => {
        const angle = startAngle + index * angleStep;
        const scale = child.maxValue ? calculateScore(child) / child.maxValue : 0;
        const [x, y] = pointFor(angle, radius, scale, centerX, centerY);
        return `${x},${y}`;
      })
      .join(" ");
  }

  function pointFor(angle, radius, scale, centerX, centerY) {
    const x = centerX + Math.cos(angle) * radius * scale;
    const y = centerY + Math.sin(angle) * radius * scale;
    return [Number(x.toFixed(2)), Number(y.toFixed(2))];
  }

  function labelAnchor(x, centerX) {
    if (Math.abs(x - centerX) < 20) {
      return "middle";
    }
    return x > centerX ? "start" : "end";
  }
})();
