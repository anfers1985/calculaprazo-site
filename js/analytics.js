/* DEPRECATED — Usar GA4 Events. Este arquivo não gera dados úteis pois
   usa localStorage que nunca chega ao servidor. Pode ser removido. */

/**
 * analytics.js — Sistema de rastreamento de visualizações para Calcula Prazo
 * Usa localStorage para contar acessos aos posts do blog
 */

(function() {
  'use strict';

  const STORAGE_KEY = 'cp_post_views';

  function trackPostView(postId) {
    if (!postId) return;
    try {
      let data = localStorage.getItem(STORAGE_KEY);
      let views = {};
      if (data) {
        try {
          views = JSON.parse(data);
        } catch (e) {
          views = {};
        }
      }
      views[postId] = (views[postId] || 0) + 1;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(views));
    } catch (e) {
      console.warn('Analytics: Erro ao rastrear visualização', e);
    }
  }

  function getPostViews(postId) {
    if (!postId) return 0;
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (!data) return 0;
      const views = JSON.parse(data);
      return views[postId] || 0;
    } catch (e) {
      return 0;
    }
  }

  function getTopPosts(limit = 10) {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (!data) return [];
      const views = JSON.parse(data);
      const topPosts = Object.entries(views)
        .map(([postId, count]) => ({ postId, views: count }))
        .sort((a, b) => b.views - a.views)
        .slice(0, limit);
      return topPosts;
    } catch (e) {
      console.warn('Analytics: Erro ao obter top posts', e);
      return [];
    }
  }

  function clearAnalytics() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      console.warn('Analytics: Erro ao limpar dados', e);
    }
  }

  function getStats() {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (!data) return { totalViews: 0, totalPosts: 0, averageViews: 0 };
      const views = JSON.parse(data);
      const totalPosts = Object.keys(views).length;
      const totalViews = Object.values(views).reduce((a, b) => a + b, 0);
      const averageViews = totalPosts > 0 ? Math.round(totalViews / totalPosts) : 0;
      return { totalViews, totalPosts, averageViews };
    } catch (e) {
      return { totalViews: 0, totalPosts: 0, averageViews: 0 };
    }
  }

  window.CalculaPrazoAnalytics = {
    trackPostView,
    getPostViews,
    getTopPosts,
    clearAnalytics,
    getStats
  };

  if (window.location.pathname.startsWith('/blog/')) {
    const postId = window.location.pathname.split('/').pop();
    if (postId) {
      setTimeout(() => {
        trackPostView(postId);
      }, 3000);
    }
  }
})();
