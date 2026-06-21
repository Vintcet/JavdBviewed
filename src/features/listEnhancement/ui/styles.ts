import type { ListDisplayControlConfig } from '../domain/config';

export interface ListDisplayStyleInput extends Omit<ListDisplayControlConfig, 'enabled'> {
  isVideoDetailPage: boolean;
  isActorPage?: boolean;
}

export interface ListDisplayStyleResult {
  itemWidthCalc: string;
  marginValue: string;
  styleContent: string;
}

export function buildPopularityStyles(): string {
  return `
      .movie-list .item[data-popularity-level] {
        position: relative;
        isolation: isolate;
      }

      .movie-list .item[data-popularity-level] > .box {
        position: relative;
        z-index: 1;
        overflow: visible !important;
        transition: transform 0.24s ease, box-shadow 0.24s ease, border-color 0.24s ease;
      }

      .movie-list .item[data-popularity-level]::before,
      .movie-list .item[data-popularity-level]::after {
        content: '';
        position: absolute;
        inset: -4px;
        border-radius: 16px;
        pointer-events: none;
        opacity: 0;
      }

      .movie-list .item[data-popularity-effect='fire']::before,
      .movie-list .item[data-popularity-effect='fire']::after {
        opacity: 1;
      }

      .movie-list .item[data-popularity-effect='fire']::before {
        border: 3px solid rgba(255,186,64,0.92);
        box-shadow:
          0 0 0 0 rgba(255,152,0,0.24),
          0 0 0 0 rgba(255,111,0,0.16),
          0 0 0 0 rgba(244,81,30,0.1);
        animation: x-popularity-fire-ripple-a 4.2s cubic-bezier(0.22, 0.61, 0.36, 1) infinite;
      }

      .movie-list .item[data-popularity-effect='fire']::after {
        border: 2px solid rgba(255,224,130,0.78);
        animation: x-popularity-fire-ripple-b 4.2s cubic-bezier(0.22, 0.61, 0.36, 1) infinite 0.36s;
      }

      .movie-list .item[data-popularity-effect='fire'] > .box {
        transform: translateY(-1px);
        box-shadow: 0 0 0 2px rgba(255,186,64,0.3);
      }

      @keyframes x-popularity-fire-ripple-a {
        0% {
          inset: -2px;
          opacity: 0.88;
          box-shadow: 0 0 0 0 rgba(255,193,7,0.28), 0 0 16px rgba(255,152,0,0.22);
        }
        70% {
          inset: -11px;
          opacity: 0.16;
          box-shadow: 0 0 0 8px rgba(255,152,0,0.16), 0 0 30px rgba(255,111,0,0.18);
        }
        100% {
          inset: -19px;
          opacity: 0;
          box-shadow: 0 0 0 10px rgba(255,111,0,0), 0 0 0 rgba(244,81,30,0);
        }
      }

      @keyframes x-popularity-fire-ripple-b {
        0% {
          inset: 0;
          opacity: 0;
        }
        25% {
          inset: -2px;
          opacity: 0.68;
        }
        75% {
          inset: -15px;
          opacity: 0.14;
        }
        100% {
          inset: -20px;
          opacity: 0;
        }
      }
    `;
}

export function buildListDisplayControlStyles(input: ListDisplayStyleInput): ListDisplayStyleResult {
  const {
    columnCount,
    containerWidth,
    enableContainerExpansion,
    enableWideLayout,
    enableSearchBarLayout,
    isVideoDetailPage,
    isActorPage = false,
  } = input;
  const itemWidthCalc = `calc(${100 / columnCount}% - 10px)`;
  const marginValue = containerWidth > 100
    ? `0 ${(100 - containerWidth) / 2}%`
    : '0 auto';

  let styleContent = '';
  if (enableContainerExpansion || enableWideLayout) {
    if (isVideoDetailPage) {
      styleContent += `
        /* 影片详情页：只扩展搜索框 */
        body #search-bar-wrap {
          width: 100% !important;
          max-width: 100% !important;
          margin-left: auto !important;
          margin-right: auto !important;
          padding-left: 1.5rem !important;
          padding-right: 1.5rem !important;
          box-sizing: border-box !important;
        }
        `;
    } else {
      styleContent += `
        /* 列表页：搜索栏和列表容器扩展到100%宽度 - 覆盖Bulma的container限制 */
        body #search-bar-wrap,
        body .container:has(.movie-list) {
          width: 100% !important;
          max-width: 100% !important;
          margin-left: auto !important;
          margin-right: auto !important;
          padding-left: 1.5rem !important;
          padding-right: 1.5rem !important;
          box-sizing: border-box !important;
        }
        `;
    }
  }

  if (enableWideLayout && !isVideoDetailPage) {
    styleContent += `
        /* JHS 风格宽屏布局：减少左右留白，让列表更接近浏览器边缘 */
        body {
          --x-list-shell-width: calc(100vw - 24px);
          --x-list-controls-width: var(--x-list-shell-width);
        }

        body .section {
          padding-left: 12px !important;
          padding-right: 12px !important;
        }

        body .container:has(.movie-list) {
          width: var(--x-list-shell-width) !important;
          max-width: var(--x-list-shell-width) !important;
          margin-left: auto !important;
          margin-right: auto !important;
          padding-left: 0 !important;
          padding-right: 0 !important;
          box-sizing: border-box !important;
        }

        body .main-tabs,
        body .tabs,
        body .toolbar,
        body .section-addition {
          width: var(--x-list-controls-width) !important;
          max-width: var(--x-list-controls-width) !important;
          margin-left: auto !important;
          margin-right: auto !important;
          box-sizing: border-box !important;
        }

        body .main-tabs,
        body .tabs {
          display: flex !important;
          overflow-x: hidden !important;
          flex-wrap: wrap !important;
          justify-content: flex-start !important;
          align-items: center !important;
          margin-top: 8px !important;
          margin-bottom: 8px !important;
        }

        body .main-tabs ul,
        body .tabs ul {
          flex-wrap: wrap !important;
          flex-grow: 0 !important;
        }

        body .toolbar {
          display: flex !important;
          flex-wrap: wrap !important;
          gap: 8px !important;
          align-items: center !important;
          justify-content: flex-start !important;
          margin-top: 6px !important;
          margin-bottom: 10px !important;
        }

        body .section-addition {
          display: flex !important;
          flex-wrap: wrap !important;
          gap: 8px !important;
          align-items: center !important;
          justify-content: flex-start !important;
          margin-top: 6px !important;
          margin-bottom: 10px !important;
        }

        body .main-tabs > div,
        body .tabs > div,
        body .section-addition > div {
          display: flex !important;
          flex-wrap: wrap !important;
          gap: 6px !important;
          align-items: center !important;
        }

        body .main-tabs > div:last-child,
        body .tabs > div:last-child {
          margin-left: auto !important;
        }
      `;

    if (isActorPage) {
      styleContent += `
        /* 演员页：资料头部保持原站内部排版，但外层与列表同样贴近页面边缘 */
        body .section > .container:has(.actor-section-name),
        body section > .container:has(.actor-section-name),
        body .section > .container:has(.section-columns),
        body section > .container:has(.section-columns),
        body .section > .container:has(.avatar-box),
        body section > .container:has(.avatar-box),
        body .actor-section .container {
          width: var(--x-list-shell-width) !important;
          max-width: var(--x-list-shell-width) !important;
          margin-left: auto !important;
          margin-right: auto !important;
          padding-left: 0 !important;
          padding-right: 0 !important;
          box-sizing: border-box !important;
        }

        body .section-columns {
          display: flex !important;
          align-items: flex-start !important;
          justify-content: flex-start !important;
          gap: 8px !important;
          width: 100% !important;
          margin: 0 0 20px 0 !important;
          flex-wrap: nowrap !important;
        }

        body .section-columns .actor-avatar,
        body .section-columns > .column:first-child {
          flex: 0 0 112px !important;
          width: 112px !important;
          max-width: 112px !important;
          padding: 0 !important;
          margin: 0 !important;
        }

        body .section-columns .actor-avatar .image,
        body .section-columns .actor-avatar .avatar,
        body .section-columns > .column:first-child .image,
        body .section-columns > .column:first-child .avatar {
          width: 112px !important;
          height: 112px !important;
          min-width: 112px !important;
          min-height: 112px !important;
          display: block !important;
          background-size: cover !important;
          background-position: top center !important;
          background-repeat: no-repeat !important;
        }

        body .section-columns > .column:not(:first-child) {
          flex: 1 1 auto !important;
          min-width: 0 !important;
          padding: 0 !important;
          margin: 0 !important;
        }

        body .actor-section-name {
          margin: 0 0 4px 0 !important;
          font-size: 24px !important;
          line-height: 1.25 !important;
          font-weight: 700 !important;
        }

        body .section-meta {
          margin: 2px 0 !important;
          line-height: 1.5 !important;
        }

        body .section-columns .panel,
        body .section-columns .panel-blocks,
        body .section-columns .movie-panel-info {
          display: grid !important;
          grid-template-columns: repeat(3, minmax(160px, 1fr)) !important;
          gap: 2px 36px !important;
          width: 100% !important;
          margin-top: 6px !important;
        }

        body .section-columns .panel-block {
          display: flex !important;
          align-items: center !important;
          gap: 4px !important;
          min-height: 24px !important;
          padding: 0 !important;
          border: 0 !important;
          line-height: 1.45 !important;
          background: transparent !important;
        }

        body .avatar-box {
          width: 100% !important;
          display: flex !important;
          align-items: flex-start !important;
          justify-content: flex-start !important;
          gap: 8px !important;
          margin: 0 0 20px 0 !important;
        }

        body .avatar-box .photo-info {
          display: flex !important;
          align-items: center !important;
          justify-content: flex-start !important;
          gap: 30px !important;
          flex-direction: row !important;
          background-color: #fff !important;
        }
      `;
    }
  }

  if (enableSearchBarLayout) {
    styleContent += `
        /* JHS 风格搜索栏：在顶部导航中使用紧凑深色搜索盒 */
        body #x-nav-search-box {
          display: none !important;
          align-items: center !important;
          flex: 1 1 520px !important;
          min-width: 0 !important;
          max-width: 680px !important;
          padding: 0 8px !important;
          margin-left: 8px !important;
          background: transparent !important;
          box-shadow: none !important;
        }

        body #x-nav-search-box .x-nav-search-inner {
          display: flex !important;
          align-items: center !important;
          gap: 5px !important;
          width: 100% !important;
          min-width: 0 !important;
        }

        body #x-nav-search-box select,
        body #x-nav-search-box input,
        body #x-nav-search-box a,
        body #x-nav-search-box button {
          height: 36px !important;
          min-height: 36px !important;
          padding: 0 12px !important;
          border: 1px solid #555 !important;
          border-radius: 4px !important;
          background: #333 !important;
          color: #eee !important;
          box-shadow: none !important;
          font-size: 14px !important;
          line-height: 34px !important;
          outline: none !important;
        }

        body #x-nav-search-box input {
          flex: 1 1 240px !important;
          min-width: 180px !important;
        }

        body #x-nav-search-box a,
        body #x-nav-search-box button {
          display: inline-flex !important;
          align-items: center !important;
          justify-content: center !important;
          background: #444 !important;
          color: #fff !important;
          text-decoration: none !important;
          font-weight: 500 !important;
          cursor: pointer !important;
          white-space: nowrap !important;
        }

        body #x-nav-search-box a:hover,
        body #x-nav-search-box button:hover {
          background: #555 !important;
          border-color: #666 !important;
        }

        body #search-bar-container[data-x-original-search-hidden="true"],
        body .search-recent-keywords {
          display: none !important;
        }

        @media (min-width: 1601px) {
          body #x-nav-search-box {
            display: flex !important;
          }

          body #search-bar-container[data-x-original-search-hidden="true"],
          body #search-bar-wrap[data-x-original-search-hidden="true"] {
            display: none !important;
          }
        }

        @media (max-width: 1600px) {
          body #x-nav-search-box {
            display: none !important;
          }

          body #search-bar-container[data-x-original-search-hidden="true"],
          body #search-bar-wrap[data-x-original-search-hidden="true"] {
            display: block !important;
          }
        }
      `;
  }

  styleContent += `
      /* 第二步：只有影片容器的宽度受滑块控制 */
      .movie-list.h[data-x-cols-override] {
        width: ${containerWidth}% !important;
        margin: ${marginValue} !important;
        transition: width 0.5s, margin 0.5s !important;
        display: flex !important;
        flex-direction: row !important;
        flex-wrap: wrap !important;
        justify-content: flex-start !important;
      }
      
      /* 直接设置item宽度 - 使用calc精确计算，考虑padding */
      .movie-list.h[data-x-cols-override] > .item {
        padding: 5px !important;
        width: ${itemWidthCalc} !important;
        flex-shrink: 0 !important;
        flex-grow: 0 !important;
        transition: width 0.5s !important;
        box-sizing: border-box !important;
      }
      
      /* 确保图片容器正确显示 */
      .movie-list.h[data-x-cols-override] > .item .box {
        width: 100% !important;
      }
    `;

  return {
    itemWidthCalc,
    marginValue,
    styleContent,
  };
}

export const LIST_ENHANCEMENT_BASE_STYLES = `
    /* 预览相关样式 */
    .x-cover {
      position: relative;
      overflow: hidden;
    }

    .x-preview {
      position: relative;
      display: block;
      overflow: hidden;
    }

    .x-preview video {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      object-fit: contain;
      z-index: 10;
      background-color: inherit;
      opacity: 0;
      transition: opacity 0.25s ease-in !important;
    }

    /* 视频控制条样式优化 */
    .x-preview video::-webkit-media-controls-panel {
      background: linear-gradient(to bottom, transparent, rgba(0, 0, 0, 0.7));
    }

    .x-preview video::-webkit-media-controls-play-button,
    .x-preview video::-webkit-media-controls-timeline,
    .x-preview video::-webkit-media-controls-current-time-display,
    .x-preview video::-webkit-media-controls-time-remaining-display,
    .x-preview video::-webkit-media-controls-mute-button,
    .x-preview video::-webkit-media-controls-volume-slider,
    .x-preview video::-webkit-media-controls-fullscreen-button {
      filter: brightness(1.2);
    }

    /* 加载状态 */
    .x-loading .cover::before {
      content: "";
      position: absolute;
      top: 50%;
      left: 50%;
      z-index: 8;
      width: 60px;
      height: 60px;
      background: transparent;
      border: 6px solid rgba(0, 0, 0, 0.8);
      border-bottom-color: #ff9800 !important;
      border-radius: 50%;
      transform: translate(-50%, -50%);
      animation: rotation 1s linear infinite;
    }

    @keyframes rotation {
      0% { 
        transform: translate(-50%, -50%) rotate(0deg); 
      }
      100% { 
        transform: translate(-50%, -50%) rotate(360deg); 
      }
    }

    /* 标题优化样式 */
    .x-title {
      position: relative;
    }

    .x-title-full {
      overflow: hidden !important;
      text-overflow: ellipsis !important;
      white-space: normal !important;
      line-height: 1.4 !important;
      height: calc(1.4em * 3 + 2px) !important;
      min-height: calc(1.4em * 3 + 2px) !important;
      max-height: calc(1.4em * 3 + 2px) !important;
      margin-bottom: 4px !important;
      box-sizing: border-box !important;
      display: -webkit-box !important;
      -webkit-box-orient: vertical !important;
      -webkit-line-clamp: 3 !important;
      line-clamp: 3 !important;
      word-break: break-word;
      overflow-wrap: anywhere;
      contain: paint;
    }

    .x-ellipsis {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .x-title-translation {
      display: block;
      margin-top: 4px;
      padding-left: 20px;
      color: #2563eb;
      font-size: 12px;
      line-height: 1.35;
      white-space: normal;
      overflow: visible;
      word-break: break-word;
    }

    .x-title-translation[data-state="pending"] {
      color: #9ca3af;
      font-style: italic;
    }

    /* 功能按钮样式 */
    .x-btn {
      display: inline-block;
      width: 12px;
      height: 12px;
      background: #3273dc;
      border-radius: 50%;
      margin-right: 8px;
      cursor: pointer;
      opacity: 0.7;
      transition: opacity 0.2s ease;
      vertical-align: middle;
    }

    .x-btn:hover {
      opacity: 1;
    }

    /* 右键菜单禁用 */
    .movie-list .item a[href*="/v/"] {
      -webkit-user-select: none;
      -moz-user-select: none;
      -ms-user-select: none;
      user-select: none;
    }

    /* 预览加载状态 */
    .x-cover.x-holding::after {
      content: '';
      position: absolute;
      top: 50%;
      left: 50%;
      width: 20px;
      height: 20px;
      margin: -10px 0 0 -10px;
      border: 2px solid #fff;
      border-top: 2px solid transparent;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      z-index: 3;
    }

    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }

    /* 响应式调整 */
    @media (max-width: 768px) {
      .x-cover video {
        pointer-events: none;
      }
    }

    /* 滚动翻页加载指示器样式 */
    .scroll-loading-indicator {
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(0, 0, 0, 0.8);
      color: white;
      padding: 12px 20px;
      border-radius: 25px;
      display: flex;
      align-items: center;
      gap: 10px;
      z-index: 9999;
      font-size: 14px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    }

    .loading-spinner {
      width: 16px;
      height: 16px;
      border: 2px solid #fff;
      border-top: 2px solid transparent;
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }

    .loading-text {
      white-space: nowrap;
    }

    /* 演员水印 */
    .x-actor-wm {
      position: absolute;
      display: flex;
      gap: 4px;
      z-index: 3;
      padding: 4px;
      pointer-events: none;
    }
    .x-actor-wm .x-actor-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      box-shadow: 0 0 0 1px rgba(0,0,0,0.25);
    }
    .x-actor-wm.pos-top-left { top: 6px; left: 6px; }
    .x-actor-wm.pos-top-right { top: 6px; right: 6px; }
    .x-actor-wm.pos-bottom-left { bottom: 6px; left: 6px; }
    .x-actor-wm.pos-bottom-right { bottom: 6px; right: 6px; }
  `;
