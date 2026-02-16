const { createApp, ref, computed, watch, nextTick, onMounted } = Vue;

createApp({
  setup() {
    // ===== STATE =====
    const view = ref('decks');
    const sidebarCollapsed = ref(false);
    const searchQuery = ref('');
    const selectedDeck = ref(null);

    // Data
    const decks = ref([]);
    const cards = ref([]);
    const totalSessions = ref(0);

    // Modals
    const showDeckModal = ref(false);
    const showCardModal = ref(false);
    const showConfirm = ref(false);
    const confirmMessage = ref('');
    let confirmCallback = null;

    // Editing
    const editingDeck = ref(null);
    const editingCard = ref(null);

    // Forms
    const deckForm = ref({ name: '', emoji: '📚', color: '#6c5ce7' });
    const cardForm = ref({ front: '', back: '' });

    // Study
    const studyCards = ref([]);
    const studyIndex = ref(0);
    const isFlipped = ref(false);
    const studyCorrect = ref(0);
    const studyWrong = ref(0);

    // Toasts
    const toasts = ref([]);
    let toastId = 0;

    // Picker options
    const emojis = ['📚', '🧠', '💻', '🌍', '🔬', '🎨', '🎵', '📐', '🏛️', '💡', '🧪', '📖', '🚀', '⚡', '🎯', '🏆'];
    const colors = ['#6c5ce7', '#00b894', '#e17055', '#fdcb6e', '#0984e3', '#e84393', '#00cec9', '#a29bfe'];

    // ===== PERSISTENCE =====
    function saveData() {
      const data = {
        decks: decks.value,
        cards: cards.value,
        totalSessions: totalSessions.value
      };
      localStorage.setItem('flashmaster_data', JSON.stringify(data));
    }

    function loadData() {
      try {
        const raw = localStorage.getItem('flashmaster_data');
        if (raw) {
          const data = JSON.parse(raw);
          decks.value = data.decks || [];
          cards.value = data.cards || [];
          totalSessions.value = data.totalSessions || 0;
        }
      } catch (e) {
        console.error('Failed to load data:', e);
      }
    }

    // Auto-save on changes
    watch([decks, cards, totalSessions], saveData, { deep: true });

    // ===== TOAST NOTIFICATIONS =====
    function showToast(message, type = 'success') {
      const iconMap = {
        success: 'fas fa-check-circle',
        error: 'fas fa-circle-exclamation',
        info: 'fas fa-circle-info'
      };
      const id = ++toastId;
      toasts.value.push({ id, message, type, icon: iconMap[type] || iconMap.info });
      setTimeout(() => {
        toasts.value = toasts.value.filter(t => t.id !== id);
      }, 3000);
    }

    // ===== HELPERS =====
    function generateId() {
      return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    }

    // ===== COMPUTED =====
    const allCards = computed(() => cards.value);

    const filteredDecks = computed(() => {
      if (!searchQuery.value.trim()) return decks.value;
      const q = searchQuery.value.toLowerCase();
      // Filter decks that match name or have cards matching the query
      return decks.value.filter(deck => {
        if (deck.name.toLowerCase().includes(q)) return true;
        return cards.value.some(
          card => card.deckId === deck.id &&
            (card.front.toLowerCase().includes(q) || card.back.toLowerCase().includes(q))
        );
      });
    });

    const masteredCount = computed(() =>
      cards.value.filter(c => c.difficulty === 'easy').length
    );

    const studyProgressPercent = computed(() => {
      if (studyCards.value.length === 0) return 0;
      return Math.round((studyIndex.value / studyCards.value.length) * 100);
    });

    const studyAccuracy = computed(() => {
      const total = studyCorrect.value + studyWrong.value;
      if (total === 0) return 0;
      return Math.round((studyCorrect.value / total) * 100);
    });

    // ===== DECK METHODS =====
    function getCardCount(deckId) {
      return cards.value.filter(c => c.deckId === deckId).length;
    }

    function getDeckCards(deckId) {
      const q = searchQuery.value.toLowerCase();
      let deckCards = cards.value.filter(c => c.deckId === deckId);
      if (q) {
        deckCards = deckCards.filter(
          c => c.front.toLowerCase().includes(q) || c.back.toLowerCase().includes(q)
        );
      }
      return deckCards;
    }

    function getDeckMastery(deckId) {
      const deckCards = cards.value.filter(c => c.deckId === deckId);
      if (deckCards.length === 0) return 0;
      const mastered = deckCards.filter(c => c.difficulty === 'easy').length;
      return Math.round((mastered / deckCards.length) * 100);
    }

    function openNewDeckModal() {
      editingDeck.value = null;
      deckForm.value = { name: '', emoji: '📚', color: '#6c5ce7' };
      showDeckModal.value = true;
    }

    function editDeck(deck) {
      editingDeck.value = deck;
      deckForm.value = { name: deck.name, emoji: deck.emoji, color: deck.color };
      showDeckModal.value = true;
    }

    function saveDeck() {
      if (!deckForm.value.name.trim()) return;

      if (editingDeck.value) {
        const idx = decks.value.findIndex(d => d.id === editingDeck.value.id);
        if (idx !== -1) {
          decks.value[idx] = { ...decks.value[idx], ...deckForm.value };
          showToast('Deck updated successfully!');
        }
      } else {
        decks.value.push({
          id: generateId(),
          name: deckForm.value.name.trim(),
          emoji: deckForm.value.emoji,
          color: deckForm.value.color,
          createdAt: new Date().toISOString()
        });
        showToast('Deck created!');
      }

      showDeckModal.value = false;
      animateNewItem();
    }

    function deleteDeck(deckId) {
      confirmMessage.value = 'Are you sure you want to delete this deck and all its cards?';
      confirmCallback = () => {
        cards.value = cards.value.filter(c => c.deckId !== deckId);
        decks.value = decks.value.filter(d => d.id !== deckId);
        if (selectedDeck.value && selectedDeck.value.id === deckId) {
          selectedDeck.value = null;
        }
        showToast('Deck deleted.', 'info');
      };
      showConfirm.value = true;
    }

    function selectDeck(deck) {
      selectedDeck.value = deck;
    }

    // ===== CARD METHODS =====
    function openNewCardModal() {
      editingCard.value = null;
      cardForm.value = { front: '', back: '' };
      showCardModal.value = true;
    }

    function editCard(card) {
      editingCard.value = card;
      cardForm.value = { front: card.front, back: card.back };
      showCardModal.value = true;
    }

    function saveCard() {
      if (!cardForm.value.front.trim() || !cardForm.value.back.trim()) return;

      if (editingCard.value) {
        const idx = cards.value.findIndex(c => c.id === editingCard.value.id);
        if (idx !== -1) {
          cards.value[idx] = {
            ...cards.value[idx],
            front: cardForm.value.front.trim(),
            back: cardForm.value.back.trim()
          };
          showToast('Card updated!');
        }
      } else {
        cards.value.push({
          id: generateId(),
          deckId: selectedDeck.value.id,
          front: cardForm.value.front.trim(),
          back: cardForm.value.back.trim(),
          difficulty: 'new',
          reviewCount: 0,
          lastReviewed: null,
          createdAt: new Date().toISOString()
        });
        showToast('Card added!');
      }

      showCardModal.value = false;
    }

    function deleteCard(cardId) {
      confirmMessage.value = 'Are you sure you want to delete this card?';
      confirmCallback = () => {
        cards.value = cards.value.filter(c => c.id !== cardId);
        showToast('Card deleted.', 'info');
      };
      showConfirm.value = true;
    }

    function confirmAction() {
      if (confirmCallback) {
        confirmCallback();
        confirmCallback = null;
      }
      showConfirm.value = false;
    }

    // ===== STUDY MODE =====
    function startStudyMode() {
      if (cards.value.length === 0) {
        showToast('No cards to study! Create some cards first.', 'error');
        return;
      }
      // Study all cards, shuffle, prioritize hard/new
      const sorted = [...cards.value].sort((a, b) => {
        const priority = { hard: 0, new: 1, medium: 2, easy: 3 };
        return (priority[a.difficulty] ?? 1) - (priority[b.difficulty] ?? 1);
      });
      studyCards.value = shuffleArray(sorted);
      studyIndex.value = 0;
      isFlipped.value = false;
      studyCorrect.value = 0;
      studyWrong.value = 0;
      view.value = 'study';
    }

    function studyDeck(deck) {
      const deckCards = cards.value.filter(c => c.deckId === deck.id);
      if (deckCards.length === 0) {
        showToast('No cards in this deck!', 'error');
        return;
      }
      studyCards.value = shuffleArray([...deckCards]);
      studyIndex.value = 0;
      isFlipped.value = false;
      studyCorrect.value = 0;
      studyWrong.value = 0;
      view.value = 'study';
    }

    function flipCard() {
      isFlipped.value = !isFlipped.value;
      // Animate with anime.js
      if (typeof anime !== 'undefined') {
        anime({
          targets: '.flashcard-container',
          scale: [0.97, 1],
          duration: 400,
          easing: 'easeOutElastic(1, 0.6)'
        });
      }
    }

    function rateCard(rating) {
      const card = studyCards.value[studyIndex.value];
      const idx = cards.value.findIndex(c => c.id === card.id);
      if (idx !== -1) {
        cards.value[idx].difficulty = rating;
        cards.value[idx].reviewCount = (cards.value[idx].reviewCount || 0) + 1;
        cards.value[idx].lastReviewed = new Date().toISOString();
      }

      if (rating === 'hard') {
        studyWrong.value++;
      } else {
        studyCorrect.value++;
      }

      // Next card
      studyIndex.value++;
      isFlipped.value = false;

      if (studyIndex.value >= studyCards.value.length) {
        totalSessions.value++;
        // Animate completion
        if (typeof anime !== 'undefined') {
          nextTick(() => {
            anime({
              targets: '.complete-card',
              scale: [0.8, 1],
              opacity: [0, 1],
              duration: 600,
              easing: 'easeOutBack'
            });
          });
        }
      }
    }

    function restartStudy() {
      studyCards.value = shuffleArray([...studyCards.value]);
      studyIndex.value = 0;
      isFlipped.value = false;
      studyCorrect.value = 0;
      studyWrong.value = 0;
    }

    function exitStudy() {
      view.value = 'decks';
    }

    // ===== STATS =====
    function difficultyCount(diff) {
      if (diff === 'new') {
        return cards.value.filter(c => !c.difficulty || c.difficulty === 'new').length;
      }
      return cards.value.filter(c => c.difficulty === diff).length;
    }

    function difficultyPercent(diff) {
      if (cards.value.length === 0) return 0;
      return Math.round((difficultyCount(diff) / cards.value.length) * 100);
    }

    // ===== UTILITIES =====
    function shuffleArray(arr) {
      const a = [...arr];
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    }

    function animateNewItem() {
      nextTick(() => {
        if (typeof anime !== 'undefined') {
          anime({
            targets: '.deck-card',
            translateY: [10, 0],
            opacity: [0.5, 1],
            duration: 400,
            easing: 'easeOutCubic',
            delay: anime.stagger(50)
          });
        }
      });
    }

    // ===== KEYBOARD SHORTCUTS =====
    function handleKeydown(e) {
      if (showDeckModal.value || showCardModal.value || showConfirm.value) {
        if (e.key === 'Escape') {
          showDeckModal.value = false;
          showCardModal.value = false;
          showConfirm.value = false;
        }
        return;
      }

      if (view.value === 'study' && studyCards.value.length > 0 && studyIndex.value < studyCards.value.length) {
        if (e.code === 'Space') {
          e.preventDefault();
          flipCard();
        }
        if (isFlipped.value) {
          if (e.key === '1') rateCard('hard');
          if (e.key === '2') rateCard('medium');
          if (e.key === '3') rateCard('easy');
        }
      }
    }

    // ===== LIFECYCLE =====
    onMounted(() => {
      loadData();
      document.addEventListener('keydown', handleKeydown);

      // Entry animation
      if (typeof anime !== 'undefined') {
        anime({
          targets: '.sidebar',
          translateX: [-60, 0],
          opacity: [0, 1],
          duration: 600,
          easing: 'easeOutCubic'
        });
        anime({
          targets: '.main-content',
          opacity: [0, 1],
          duration: 800,
          delay: 200,
          easing: 'easeOutCubic'
        });
      }
    });

    // ===== RETURN =====
    return {
      // State
      view,
      sidebarCollapsed,
      searchQuery,
      selectedDeck,
      decks,
      cards,
      totalSessions,

      // Modals
      showDeckModal,
      showCardModal,
      showConfirm,
      confirmMessage,

      // Editing
      editingDeck,
      editingCard,

      // Forms
      deckForm,
      cardForm,

      // Study
      studyCards,
      studyIndex,
      isFlipped,
      studyCorrect,
      studyWrong,

      // Toasts
      toasts,

      // Options
      emojis,
      colors,

      // Computed
      allCards,
      filteredDecks,
      masteredCount,
      studyProgressPercent,
      studyAccuracy,

      // Deck methods
      getCardCount,
      getDeckCards,
      getDeckMastery,
      openNewDeckModal,
      editDeck,
      saveDeck,
      deleteDeck,
      selectDeck,

      // Card methods
      openNewCardModal,
      editCard,
      saveCard,
      deleteCard,
      confirmAction,

      // Study methods
      startStudyMode,
      studyDeck,
      flipCard,
      rateCard,
      restartStudy,
      exitStudy,

      // Stats
      difficultyCount,
      difficultyPercent
    };
  }
}).mount('#app');