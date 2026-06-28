import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import './App.css'

const PLAYER_NAMES = ['Player 1', 'Player 2', 'Player 3']
const HUMAN_INDEX = 0
const SUITS = ['♣', '♦', '♥', '♠']
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']
const TURN_SECONDS = 30
const RANK_VALUES = {
  A: 1,
  2: 2,
  3: 3,
  4: 4,
  5: 5,
  6: 6,
  7: 7,
  8: 8,
  9: 9,
  10: 10,
  J: 11,
  Q: 12,
  K: 13,
}
const DEADWOOD_VALUES = {
  A: 1,
  2: 2,
  3: 3,
  4: 4,
  5: 5,
  6: 6,
  7: 7,
  8: 8,
  9: 9,
  10: 10,
  J: 10,
  Q: 10,
  K: 10,
}
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

let cachedSupabaseClient = null

function getSupabaseClient() {
  if (cachedSupabaseClient) return cachedSupabaseClient
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to enable Supabase Presence.')
  }

  cachedSupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

  return cachedSupabaseClient
}

function createPresenceKey(playerName) {
  const randomValue = window.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`

  return `${playerName.trim() || 'guest'}-${randomValue}`
}

function roleForPresenceIndex(index) {
  return PLAYER_NAMES[index] ?? 'Spectator'
}

function getPlayerIndexFromRole(role) {
  const index = PLAYER_NAMES.indexOf(role)

  return index === -1 ? HUMAN_INDEX : index
}

function createDeck() {
  return SUITS.flatMap((suit) =>
    RANKS.map((rank) => ({
      id: `${rank}${suit}`,
      rank,
      suit,
    })),
  )
}

function createDealId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function assertUniqueCardIds(cards, context) {
  const duplicateIds = cards
    .map((card) => card.id)
    .filter((cardId, index, cardIds) => cardIds.indexOf(cardId) !== index)

  if (duplicateIds.length > 0) {
    throw new Error(`${context} contains duplicate cards: ${[...new Set(duplicateIds)].join(', ')}`)
  }
}

function addUniqueCardToHand(hand, card) {
  if (hand.some((heldCard) => heldCard.id === card.id)) return hand

  return [...hand, card]
}

function normalizeUniqueCards(cards) {
  const seenCardIds = new Set()

  return sortCards(
    cards.filter((card) => {
      if (seenCardIds.has(card.id)) return false

      seenCardIds.add(card.id)
      return true
    }),
  )
}

function shuffle(cards) {
  const shuffled = [...cards]

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    ;[shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]]
  }

  return shuffled
}

function sortCards(cards) {
  return [...cards].sort((first, second) => {
    if (first.suit !== second.suit) return SUITS.indexOf(first.suit) - SUITS.indexOf(second.suit)

    return RANK_VALUES[second.rank] - RANK_VALUES[first.rank]
  })
}

function sortByDeadwood(cards) {
  return [...cards].sort((first, second) => {
    const deadwoodDifference = DEADWOOD_VALUES[second.rank] - DEADWOOD_VALUES[first.rank]
    if (deadwoodDifference !== 0) return deadwoodDifference
    if (RANK_VALUES[second.rank] !== RANK_VALUES[first.rank]) return RANK_VALUES[second.rank] - RANK_VALUES[first.rank]

    return SUITS.indexOf(first.suit) - SUITS.indexOf(second.suit)
  })
}

function groupCardsByRank(cards) {
  return cards.reduce((groups, card) => {
    const rankCards = groups.get(card.rank) ?? []
    groups.set(card.rank, [...rankCards, card])

    return groups
  }, new Map())
}

function groupCardsBySuit(cards) {
  return cards.reduce((groups, card) => {
    const suitCards = groups.get(card.suit) ?? []
    groups.set(card.suit, [...suitCards, card])

    return groups
  }, new Map())
}

function removeUsedCards(cards, usedCardIds) {
  return cards.filter((card) => !usedCardIds.has(card.id))
}

function createHandGroup(type, cards) {
  return {
    id: `${type}-${cards.map((card) => card.id).join('-')}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    cardIds: cards.map((card) => card.id),
    type,
  }
}

function findBahayMelds(hand) {
  const melds = []
  let remainingCards = [...hand]
  const usedCardIds = new Set()

  const rankGroups = [...groupCardsByRank(remainingCards).values()]
    .filter((cards) => cards.length >= 3)
    .map((cards) => sortCards(cards).slice(0, 4))
    .sort((first, second) => second.length - first.length || DEADWOOD_VALUES[second[0].rank] - DEADWOOD_VALUES[first[0].rank])

  for (const rankGroup of rankGroups) {
    if (rankGroup.some((card) => usedCardIds.has(card.id))) continue

    melds.push(rankGroup)
    rankGroup.forEach((card) => usedCardIds.add(card.id))
  }

  remainingCards = removeUsedCards(remainingCards, usedCardIds)

  for (const suitCards of groupCardsBySuit(remainingCards).values()) {
    const orderedCards = [...suitCards].sort((first, second) => RANK_VALUES[first.rank] - RANK_VALUES[second.rank])
    let run = []

    for (const card of orderedCards) {
      const previousCard = run.at(-1)

      if (!previousCard || RANK_VALUES[card.rank] === RANK_VALUES[previousCard.rank] + 1) {
        run.push(card)
      } else {
        if (run.length >= 3) {
          melds.push(sortCards(run))
          run.forEach((runCard) => usedCardIds.add(runCard.id))
        }
        run = [card]
      }
    }

    if (run.length >= 3) {
      melds.push(sortCards(run))
      run.forEach((runCard) => usedCardIds.add(runCard.id))
    }
  }

  return {
    melds,
    remainingCards: removeUsedCards(hand, usedCardIds),
  }
}

function findTwaites(hand) {
  const twaites = []
  let remainingCards = [...hand]
  const usedCardIds = new Set()

  const pairs = [...groupCardsByRank(remainingCards).values()]
    .filter((cards) => cards.length === 2)
    .map((cards) => sortCards(cards))
    .sort((first, second) => DEADWOOD_VALUES[second[0].rank] - DEADWOOD_VALUES[first[0].rank])

  for (const pair of pairs) {
    if (pair.some((card) => usedCardIds.has(card.id))) continue

    twaites.push(pair)
    pair.forEach((card) => usedCardIds.add(card.id))
  }

  remainingCards = removeUsedCards(remainingCards, usedCardIds)

  for (const suitCards of groupCardsBySuit(remainingCards).values()) {
    const orderedCards = [...suitCards].sort((first, second) => RANK_VALUES[first.rank] - RANK_VALUES[second.rank])

    for (let index = 0; index < orderedCards.length - 1; index += 1) {
      const first = orderedCards[index]
      if (usedCardIds.has(first.id)) continue

      const mate = orderedCards
        .slice(index + 1)
        .find((candidate) => !usedCardIds.has(candidate.id) && RANK_VALUES[candidate.rank] - RANK_VALUES[first.rank] <= 2)

      if (!mate) continue

      const twaitesGroup = sortCards([first, mate])
      twaites.push(twaitesGroup)
      twaitesGroup.forEach((card) => usedCardIds.add(card.id))
    }
  }

  return {
    remainingCards: removeUsedCards(hand, usedCardIds),
    twaites,
  }
}

function handleAutoSort(hand) {
  const { melds, remainingCards: afterMelds } = findBahayMelds(hand)
  const { twaites, remainingCards } = findTwaites(afterMelds)
  const deadwood = sortByDeadwood(remainingCards)
  const orderedGroups = [
    ...melds.map((cards) => ({ cards: sortCards(cards), type: 'meld' })),
    ...twaites.map((cards) => ({ cards: sortCards(cards), type: 'twaite' })),
  ]
  const handGroups = orderedGroups.map((group) => createHandGroup(group.type, group.cards))

  return {
    hand: [...orderedGroups.flatMap((group) => group.cards), ...deadwood],
    handGroups,
  }
}

function getHandRenderGroups(hand, handGroups = []) {
  const cardById = new Map(hand.map((card) => [card.id, card]))
  const usedCardIds = new Set()
  const renderGroups = []

  for (const group of handGroups) {
    const cards = group.cardIds.map((cardId) => cardById.get(cardId)).filter(Boolean)

    if (cards.length < 2 || cards.some((card) => usedCardIds.has(card.id))) continue

    cards.forEach((card) => usedCardIds.add(card.id))
    renderGroups.push({
      ...group,
      cards,
    })
  }

  for (const card of hand) {
    if (usedCardIds.has(card.id)) continue

    renderGroups.push({
      cards: [card],
      id: `single-${card.id}`,
      type: 'single',
    })
  }

  return renderGroups
}

function moveCardInHand(hand, draggedCardId, targetCardId) {
  if (draggedCardId === targetCardId) return hand

  const nextHand = [...hand]
  const fromIndex = nextHand.findIndex((card) => card.id === draggedCardId)
  const toIndex = nextHand.findIndex((card) => card.id === targetCardId)

  if (fromIndex === -1 || toIndex === -1) return hand

  const [draggedCard] = nextHand.splice(fromIndex, 1)
  nextHand.splice(toIndex, 0, draggedCard)

  return nextHand
}

function formatCard(card) {
  return `${card.rank}${card.suit}`
}

function isRedSuit(card) {
  return card.suit === '♥' || card.suit === '♦'
}

function createPlayer(name, seatIndex) {
  return {
    name,
    seatIndex,
    hand: [],
    handGroups: [],
    exposedMelds: [],
    isOpened: false,
    isSapawed: false,
    isBurned: false,
    hasSelfConnectedLastTurn: false,
  }
}

function buildNewGame() {
  const deck = shuffle(createDeck())
  assertUniqueCardIds(deck, 'Deck')

  const players = PLAYER_NAMES.map(createPlayer)

  players[0].hand = sortCards(deck.slice(0, 13))
  players[1].hand = sortCards(deck.slice(13, 25))
  players[2].hand = sortCards(deck.slice(25, 37))

  assertUniqueCardIds(
    [...players[0].hand, ...players[1].hand, ...players[2].hand, ...deck.slice(37)],
    'Initial deal',
  )

  return {
    dealId: createDealId(),
    players,
    stockPile: deck.slice(37),
    discardPile: [],
    currentPlayerIndex: 0,
    phase: 'meld',
    selectedCardIds: [],
    newlyDrawnCardId: null,
    pendingDiscardDrawId: null,
    turnSelfConnected: false,
    lastStockTakerIndex: null,
    winner: null,
    foldedPlayerIds: [],
    message: 'Player 1 is the dealer and starts with 13 cards. Opening draw is skipped; meld if desired, then discard.',
    log: ['New Tongits table dealt. Dealer opens in meld/discard phase; stock has 15 cards.'],
  }
}

function validateMeld(cards) {
  if (cards.length < 3) return { valid: false, type: null }

  const sameRank = cards.every((card) => card.rank === cards[0].rank)
  const uniqueSuits = new Set(cards.map((card) => card.suit)).size === cards.length

  if ((cards.length === 3 || cards.length === 4) && sameRank && uniqueSuits) {
    return { valid: true, type: 'group' }
  }

  const sameSuit = cards.every((card) => card.suit === cards[0].suit)
  const orderedValues = cards.map((card) => RANK_VALUES[card.rank]).sort((a, b) => a - b)
  const consecutive = orderedValues.every((value, index) => index === 0 || value === orderedValues[index - 1] + 1)

  if (sameSuit && consecutive) return { valid: true, type: 'run' }

  return { valid: false, type: null }
}

function calculateDeadwood(hand) {
  return hand.reduce((total, card) => total + DEADWOOD_VALUES[card.rank], 0)
}

function getNextPlayerIndex(currentPlayerIndex) {
  return (currentPlayerIndex + 1) % 3
}

function getSelectedCards(hand, selectedCardIds) {
  return hand.filter((card) => selectedCardIds.includes(card.id))
}

function pruneHandGroups(handGroups = [], hand) {
  const handCardIds = new Set(hand.map((card) => card.id))

  return handGroups
    .map((group) => ({
      ...group,
      cardIds: group.cardIds.filter((cardId) => handCardIds.has(cardId)),
    }))
    .filter((group) => group.cardIds.length > 1)
}

function removeCards(hand, cardIds) {
  return hand.filter((card) => !cardIds.includes(card.id))
}

function getAllTrackedCards(gameState) {
  return [
    ...gameState.stockPile,
    ...gameState.discardPile,
    ...gameState.players.flatMap((player) => player.hand),
    ...gameState.players.flatMap((player) => player.exposedMelds.flat()),
  ]
}

function validateCardConservation(gameState) {
  const allCards = getAllTrackedCards(gameState)
  const cardIds = allCards.map((card) => card.id)
  const duplicateIds = cardIds.filter((cardId, index) => cardIds.indexOf(cardId) !== index)

  return {
    duplicateIds: [...new Set(duplicateIds)],
    isValid: allCards.length === 52 && duplicateIds.length === 0,
    totalCards: allCards.length,
  }
}

function assertCardConservation(gameState, context) {
  const result = validateCardConservation(gameState)

  if (!result.isValid) {
    throw new Error(
      `${context} broke card conservation. Count=${result.totalCards}; duplicates=${result.duplicateIds.join(', ') || 'none'}`,
    )
  }
}

function moveTopStockCardToHand(gameState, playerIndex) {
  const [drawnCard, ...stockPile] = gameState.stockPile
  if (!drawnCard) return gameState

  const players = gameState.players.map((player, index) =>
    index === playerIndex
      ? {
          ...player,
          hand: addUniqueCardToHand(player.hand, drawnCard),
        }
      : player,
  )

  return {
    ...gameState,
    players,
    stockPile,
  }
}

function moveTopDiscardCardToHand(gameState, playerIndex) {
  const drawnCard = gameState.discardPile.at(-1)
  if (!drawnCard) return gameState

  const discardPile = gameState.discardPile.slice(0, -1)
  const players = gameState.players.map((player, index) =>
    index === playerIndex
      ? {
          ...player,
          hand: addUniqueCardToHand(player.hand, drawnCard),
        }
      : player,
  )

  return {
    ...gameState,
    discardPile,
    players,
  }
}

function normalizeControlledPlayerIndexes(viewerPlayerIndexes) {
  return new Set(Array.isArray(viewerPlayerIndexes) ? viewerPlayerIndexes : [viewerPlayerIndexes])
}

function maskGameStateForViewer(gameState, viewerPlayerIndexes) {
  const visiblePlayerIndexes = normalizeControlledPlayerIndexes(viewerPlayerIndexes)

  return {
    ...gameState,
    selectedCardIds: [],
    players: gameState.players.map((player, playerIndex) => ({
      ...player,
      handGroups: visiblePlayerIndexes.has(playerIndex) ? player.handGroups : [],
      hand: visiblePlayerIndexes.has(playerIndex) ? player.hand : [],
    })),
  }
}

function buildPublicGameState(gameState) {
  return {
    ...gameState,
    selectedCardIds: [],
    players: gameState.players.map((player) => ({
      ...player,
      handGroups: [],
      hand: [],
    })),
  }
}

function mergePublicGameStateWithPrivateHand(currentGameState, publicGameState, viewerPlayerIndexes) {
  const controlledPlayerIndexes = normalizeControlledPlayerIndexes(viewerPlayerIndexes)

  return {
    ...publicGameState,
    selectedCardIds: [],
    players: publicGameState.players.map((player, playerIndex) => ({
      ...player,
      handGroups: controlledPlayerIndexes.has(playerIndex)
        ? currentGameState.players[playerIndex]?.handGroups ?? []
        : [],
      hand: controlledPlayerIndexes.has(playerIndex)
        ? currentGameState.players[playerIndex]?.hand ?? player.hand
        : [],
    })),
  }
}

async function sendPrivateHandToSeat(roomCode, recipientPresenceKey, hand, role, dealId, botPlayerIndex) {
  const supabaseClient = getSupabaseClient()
  const privateChannel = supabaseClient.channel(`room:${roomCode}:private:${recipientPresenceKey}`)

  await new Promise((resolve, reject) => {
    privateChannel.subscribe((status) => {
      if (status === 'SUBSCRIBED') resolve()
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        reject(new Error(`Private hand channel status: ${status}`))
      }
    })
  })

  await privateChannel.send({
    event: 'private-hand',
    payload: {
      dealId,
      hand,
      role,
      botPlayerIndex,
      sentAt: new Date().toISOString(),
    },
    type: 'broadcast',
  })
  await supabaseClient.removeChannel(privateChannel)
}

function appendLog(gameState, entry) {
  return [entry, ...gameState.log].slice(0, 7)
}

function canCallDraw(player) {
  return player.isOpened && !player.isSapawed && !player.hasSelfConnectedLastTurn
}

function findWinnerByLowestScore(gameState, eligibleIndexes, mode, anchorIndex) {
  const scored = eligibleIndexes.map((playerIndex) => ({
    playerIndex,
    score: calculateDeadwood(gameState.players[playerIndex].hand),
  }))
  const lowestScore = Math.min(...scored.map((item) => item.score))
  const tied = scored.filter((item) => item.score === lowestScore).map((item) => item.playerIndex)

  if (tied.length === 1) return tied[0]

  if (mode === 'draw') {
    const tiedChallengers = tied.filter((playerIndex) => playerIndex !== anchorIndex)
    if (tiedChallengers.length === 0) return anchorIndex

    return tiedChallengers
      .map((playerIndex) => ({
        playerIndex,
        distance: (playerIndex - anchorIndex + 3) % 3,
      }))
      .sort((first, second) => first.distance - second.distance)[0].playerIndex
  }

  if (tied.includes(anchorIndex)) return anchorIndex

  for (let offset = 1; offset <= 3; offset += 1) {
    const candidateIndex = (anchorIndex - offset + 3) % 3
    if (tied.includes(candidateIndex)) return candidateIndex
  }

  return tied[0]
}

function resolveDeckDepletion(gameState, lastTakerIndex) {
  const players = gameState.players.map((player) => ({
    ...player,
    isBurned: !player.isOpened,
  }))
  const eligibleIndexes = players.flatMap((player, index) => (player.isOpened ? [index] : []))
  const fallbackWinner = lastTakerIndex ?? gameState.currentPlayerIndex
  const winnerIndex =
    eligibleIndexes.length > 0
      ? findWinnerByLowestScore({ ...gameState, players }, eligibleIndexes, 'depletion', fallbackWinner)
      : fallbackWinner

  return {
    ...gameState,
    players,
    phase: 'gameOver',
    currentPlayerIndex: winnerIndex,
    winner: {
      playerIndex: winnerIndex,
      reason: 'Deck depletion',
      scores: players.map((player) => calculateDeadwood(player.hand)),
    },
    message: `${players[winnerIndex].name} wins on deck depletion.`,
    log: appendLog(gameState, `Stock pile depleted. ${players[winnerIndex].name} wins the point comparison.`),
  }
}

function finishTurn(gameState, playerIndex, discardedCard) {
  const nextPlayerIndex = getNextPlayerIndex(playerIndex)
  const players = gameState.players.map((player, index) => {
    if (index !== playerIndex) return player

    return {
      ...player,
      hasSelfConnectedLastTurn: gameState.turnSelfConnected,
    }
  })

  players[nextPlayerIndex] = {
    ...players[nextPlayerIndex],
    isSapawed: false,
    hasSelfConnectedLastTurn: false,
  }

  if (players[playerIndex].hand.length === 0) {
    return {
      ...gameState,
      players,
      selectedCardIds: [],
      pendingDiscardDrawId: null,
      phase: 'gameOver',
      winner: {
        playerIndex,
        reason: 'Tongits',
        scores: players.map((player) => calculateDeadwood(player.hand)),
      },
      message: `${players[playerIndex].name} wins by Tongits.`,
      log: appendLog(gameState, `${players[playerIndex].name} emptied their hand and wins instantly.`),
    }
  }

  return {
    ...gameState,
    players,
    currentPlayerIndex: nextPlayerIndex,
    phase: 'preDraw',
    selectedCardIds: [],
    pendingDiscardDrawId: null,
    turnSelfConnected: false,
    message: `${players[nextPlayerIndex].name}'s turn. Draw phase begins.`,
    log: appendLog(gameState, `${players[playerIndex].name} discarded ${formatCard(discardedCard)}.`),
  }
}

function drawFromStock(gameState, playerIndex) {
  if (gameState.phase !== 'preDraw') return gameState
  if (gameState.stockPile.length === 0) return resolveDeckDepletion(gameState, gameState.lastStockTakerIndex)

  const drawnCard = gameState.stockPile[0]
  const movedState = moveTopStockCardToHand(gameState, playerIndex)
  const nextState = {
    ...movedState,
    phase: 'meld',
    selectedCardIds: [],
    newlyDrawnCardId: drawnCard?.id ?? null,
    lastStockTakerIndex: playerIndex,
    message: `${movedState.players[playerIndex].name} drew from the stock pile.`,
    log: appendLog(gameState, `${movedState.players[playerIndex].name} drew from stock.`),
  }

  if (movedState.stockPile.length === 0) return resolveDeckDepletion(nextState, playerIndex)

  return nextState
}

function drawFromDiscard(gameState, playerIndex) {
  if (gameState.phase !== 'preDraw' || gameState.discardPile.length === 0) return gameState

  const drawnCard = gameState.discardPile.at(-1)
  const movedState = moveTopDiscardCardToHand(gameState, playerIndex)

  return {
    ...movedState,
    phase: 'meld',
    pendingDiscardDrawId: drawnCard.id,
    selectedCardIds: [drawnCard.id],
    newlyDrawnCardId: null,
    message: `${movedState.players[playerIndex].name} took ${formatCard(drawnCard)} from discard. It must be used in a new exposed meld.`,
    log: appendLog(gameState, `${movedState.players[playerIndex].name} drew ${formatCard(drawnCard)} from discard.`),
  }
}

function exposeSelectedMeld(gameState, playerIndex) {
  const player = gameState.players[playerIndex]
  const selectedCards = getSelectedCards(player.hand, gameState.selectedCardIds)
  const validation = validateMeld(selectedCards)

  if (gameState.phase !== 'meld' || !validation.valid) {
    return {
      ...gameState,
      message: 'That selection is not a valid Tongits meld.',
    }
  }

  if (gameState.pendingDiscardDrawId && !gameState.selectedCardIds.includes(gameState.pendingDiscardDrawId)) {
    return {
      ...gameState,
      message: 'The discard card must be part of the brand new meld.',
    }
  }

  const players = gameState.players.map((currentPlayer, index) =>
    index === playerIndex
      ? (() => {
          const hand = removeCards(currentPlayer.hand, gameState.selectedCardIds)

          return {
            ...currentPlayer,
            hand,
            handGroups: pruneHandGroups(currentPlayer.handGroups, hand),
            exposedMelds: [...currentPlayer.exposedMelds, sortCards(selectedCards)],
            isOpened: true,
          }
        })()
      : currentPlayer,
  )

  return {
    ...gameState,
    players,
    selectedCardIds: [],
    newlyDrawnCardId: null,
    pendingDiscardDrawId: null,
    message: `${players[playerIndex].name} opened a ${validation.type}.`,
    log: appendLog(gameState, `${players[playerIndex].name} exposed ${selectedCards.map(formatCard).join(' ')}.`),
  }
}

function sapawSelectedCard(gameState, targetPlayerIndex, meldIndex) {
  const playerIndex = gameState.currentPlayerIndex
  const player = gameState.players[playerIndex]
  const selectedCards = getSelectedCards(player.hand, gameState.selectedCardIds)

  if (gameState.phase !== 'meld' || selectedCards.length !== 1) {
    return {
      ...gameState,
      message: 'Select exactly one card to sapaw.',
    }
  }

  if (gameState.pendingDiscardDrawId) {
    return {
      ...gameState,
      message: 'A discard draw must first become a brand new meld, not a sapaw.',
    }
  }

  const selectedCard = selectedCards[0]
  const targetMeld = gameState.players[targetPlayerIndex].exposedMelds[meldIndex]
  const validation = validateMeld([...targetMeld, selectedCard])

  if (!validation.valid) {
    return {
      ...gameState,
      message: `${formatCard(selectedCard)} cannot connect to that meld.`,
    }
  }

  const players = gameState.players.map((currentPlayer, index) => {
    if (index === playerIndex) {
      const hand = removeCards(currentPlayer.hand, [selectedCard.id])

      return {
        ...currentPlayer,
        hand,
        handGroups: pruneHandGroups(currentPlayer.handGroups, hand),
      }
    }

    return currentPlayer
  })

  players[targetPlayerIndex] = {
    ...players[targetPlayerIndex],
    exposedMelds: players[targetPlayerIndex].exposedMelds.map((meld, index) =>
      index === meldIndex ? sortCards([...meld, selectedCard]) : meld,
    ),
    isSapawed: targetPlayerIndex !== playerIndex ? true : players[targetPlayerIndex].isSapawed,
  }

  return {
    ...gameState,
    players,
    selectedCardIds: [],
    newlyDrawnCardId: null,
    turnSelfConnected: targetPlayerIndex === playerIndex || gameState.turnSelfConnected,
    message: `${PLAYER_NAMES[playerIndex]} connected ${formatCard(selectedCard)} to ${PLAYER_NAMES[targetPlayerIndex]}'s meld.`,
    log: appendLog(gameState, `${PLAYER_NAMES[playerIndex]} sapawed ${formatCard(selectedCard)}.`),
  }
}

function discardSelectedCard(gameState, playerIndex) {
  const player = gameState.players[playerIndex]
  const selectedCards = getSelectedCards(player.hand, gameState.selectedCardIds)

  if (gameState.phase !== 'discard' && gameState.phase !== 'meld') return gameState

  if (gameState.pendingDiscardDrawId) {
    return {
      ...gameState,
      message: 'You must expose a new meld using the discard card before discarding.',
    }
  }

  if (selectedCards.length !== 1) {
    return {
      ...gameState,
      message: 'Select exactly one card to discard.',
    }
  }

  const discardedCard = selectedCards[0]
  const players = gameState.players.map((currentPlayer, index) =>
    index === playerIndex
      ? (() => {
          const hand = removeCards(currentPlayer.hand, [discardedCard.id])

          return {
            ...currentPlayer,
            hand,
            handGroups: pruneHandGroups(currentPlayer.handGroups, hand),
          }
        })()
      : currentPlayer,
  )

  return finishTurn(
    {
      ...gameState,
      players,
      discardPile: [...gameState.discardPile, discardedCard],
      phase: 'discard',
      newlyDrawnCardId: null,
    },
    playerIndex,
    discardedCard,
  )
}

function callDraw(gameState, playerIndex) {
  const player = gameState.players[playerIndex]

  if (gameState.phase !== 'preDraw' || !canCallDraw(player)) {
    return {
      ...gameState,
      message: 'Draw/Laban is not legal right now.',
    }
  }

  const players = gameState.players.map((currentPlayer) => ({
    ...currentPlayer,
    isBurned: !currentPlayer.isOpened,
  }))
  const eligibleIndexes = players.flatMap((currentPlayer, index) => (currentPlayer.isOpened ? [index] : []))
  const winnerIndex = findWinnerByLowestScore({ ...gameState, players }, eligibleIndexes, 'draw', playerIndex)

  return {
    ...gameState,
    players,
    phase: 'gameOver',
    foldedPlayerIds: players.flatMap((currentPlayer, index) => (!currentPlayer.isOpened ? [index] : [])),
    winner: {
      playerIndex: winnerIndex,
      reason: 'Challenged Draw',
      scores: players.map((currentPlayer) => calculateDeadwood(currentPlayer.hand)),
    },
    message: `${players[playerIndex].name} called Draw. ${players[winnerIndex].name} wins the Laban.`,
    log: appendLog(gameState, `${players[playerIndex].name} called Draw/Laban.`),
  }
}

function findFirstMeld(hand, requiredCardId = null) {
  const combinations = []

  for (let first = 0; first < hand.length - 2; first += 1) {
    for (let second = first + 1; second < hand.length - 1; second += 1) {
      for (let third = second + 1; third < hand.length; third += 1) {
        combinations.push([hand[first], hand[second], hand[third]])

        for (let fourth = third + 1; fourth < hand.length; fourth += 1) {
          combinations.push([hand[first], hand[second], hand[third], hand[fourth]])
        }
      }
    }
  }

  return combinations.find((cards) => {
    if (requiredCardId && !cards.some((card) => card.id === requiredCardId)) return false

    return validateMeld(cards).valid
  })
}

function findSapawTarget(gameState, playerIndex) {
  const hand = gameState.players[playerIndex].hand

  for (const card of hand) {
    for (let ownerIndex = 0; ownerIndex < gameState.players.length; ownerIndex += 1) {
      const owner = gameState.players[ownerIndex]

      for (let meldIndex = 0; meldIndex < owner.exposedMelds.length; meldIndex += 1) {
        if (validateMeld([...owner.exposedMelds[meldIndex], card]).valid) {
          return {
            cardId: card.id,
            ownerIndex,
            meldIndex,
          }
        }
      }
    }
  }

  return null
}

function chooseDiscard(hand) {
  return [...hand].sort((first, second) => DEADWOOD_VALUES[second.rank] - DEADWOOD_VALUES[first.rank])[0]
}

function runTimeoutMove(gameState, playerIndex) {
  if (gameState.phase === 'gameOver') return gameState

  if (gameState.phase === 'preDraw') {
    if (gameState.stockPile.length > 0) {
      return runTimeoutMove(drawFromStock(gameState, playerIndex), playerIndex)
    }
    if (gameState.discardPile.length > 0) {
      return runTimeoutMove(drawFromDiscard(gameState, playerIndex), playerIndex)
    }

    return gameState
  }

  let nextState = gameState

  if (nextState.pendingDiscardDrawId) {
    const forcedMeld = findFirstMeld(nextState.players[playerIndex].hand, nextState.pendingDiscardDrawId)

    if (forcedMeld) {
      nextState = exposeSelectedMeld(
        {
          ...nextState,
          selectedCardIds: forcedMeld.map((card) => card.id),
        },
        playerIndex,
      )
    } else {
      return {
        ...nextState,
        message: `${PLAYER_NAMES[playerIndex]} timed out but must expose the discard card before ending the turn.`,
      }
    }
  }

  const discardCard = chooseDiscard(nextState.players[playerIndex].hand)

  if (!discardCard) return nextState

  return discardSelectedCard(
    {
      ...nextState,
      selectedCardIds: [discardCard.id],
    },
    playerIndex,
  )
}

function runCpuTurn(gameState) {
  const playerIndex = gameState.currentPlayerIndex
  const player = gameState.players[playerIndex]

  if (gameState.phase === 'gameOver' || playerIndex === HUMAN_INDEX) return gameState

  if (gameState.phase === 'preDraw') {
    if (canCallDraw(player) && calculateDeadwood(player.hand) <= 7) return callDraw(gameState, playerIndex)

    const discardCard = gameState.discardPile.at(-1)
    if (discardCard) {
      const withDiscard = sortCards([...player.hand, discardCard])
      const discardMeld = findFirstMeld(withDiscard, discardCard.id)

      if (discardMeld) return drawFromDiscard(gameState, playerIndex)
    }

    return drawFromStock(gameState, playerIndex)
  }

  let nextState = gameState
  const pendingCardId = nextState.pendingDiscardDrawId
  const pendingMeld = findFirstMeld(nextState.players[playerIndex].hand, pendingCardId)

  if (pendingMeld) {
    nextState = {
      ...nextState,
      selectedCardIds: pendingMeld.map((card) => card.id),
    }
    nextState = exposeSelectedMeld(nextState, playerIndex)
  } else if (!pendingCardId) {
    const meld = findFirstMeld(nextState.players[playerIndex].hand)

    if (meld) {
      nextState = {
        ...nextState,
        selectedCardIds: meld.map((card) => card.id),
      }
      nextState = exposeSelectedMeld(nextState, playerIndex)
    }

    const sapawTarget = findSapawTarget(nextState, playerIndex)
    if (sapawTarget) {
      nextState = {
        ...nextState,
        selectedCardIds: [sapawTarget.cardId],
      }
      nextState = sapawSelectedCard(nextState, sapawTarget.ownerIndex, sapawTarget.meldIndex)
    }
  }

  const discardCard = chooseDiscard(nextState.players[playerIndex].hand)

  if (!discardCard) {
    return {
      ...nextState,
      phase: 'gameOver',
      winner: {
        playerIndex,
        reason: 'Tongits',
        scores: nextState.players.map((currentPlayer) => calculateDeadwood(currentPlayer.hand)),
      },
      message: `${PLAYER_NAMES[playerIndex]} wins by Tongits.`,
    }
  }

  return discardSelectedCard(
    {
      ...nextState,
      selectedCardIds: [discardCard.id],
    },
    playerIndex,
  )
}

function generateRoomCode() {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

  return Array.from({ length: 4 }, () => letters[Math.floor(Math.random() * letters.length)]).join('')
}

function normalizeRoomCode(value) {
  return value.replace(/[^a-z0-9]/gi, '').toUpperCase().slice(0, 4)
}

function CardButton({ card, isSelected, onClick, className = '', style, ...buttonProps }) {
  return (
    <button
      className={`card ${isRedSuit(card) ? 'red' : 'black'} ${isSelected ? 'selected' : ''} ${className}`}
      onClick={onClick}
      style={style}
      type="button"
      {...buttonProps}
    >
      <span>{card.rank}</span>
      <strong>{card.suit}</strong>
    </button>
  )
}

function MiniCard({ card }) {
  return (
    <span className={`mini-card ${isRedSuit(card) ? 'red' : 'black'}`}>
      {formatCard(card)}
    </span>
  )
}

function DiscardHistoryModal({ cards, onClose }) {
  if (cards.length === 0) return null

  return (
    <section className="discard-modal-backdrop" aria-label="Discard pile history" role="dialog">
      <div className="discard-modal">
        <header>
          <div>
            <span>Discard History</span>
            <strong>Oldest to newest</strong>
          </div>
          <button onClick={onClose} type="button">
            Close
          </button>
        </header>

        <div className="discard-history-grid">
          {cards.map((card, index) => (
            <div className="discard-history-item" key={`${card.id}-${index}`}>
              <MiniCard card={card} />
              <span>{index === cards.length - 1 ? 'Top discard' : `#${index + 1}`}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function TongitsGame({
  appMode,
  connectedPlayers,
  multiplayerBotEnabled,
  multiplayerDealStarted,
  myRole,
  onMultiplayerDealStarted,
  onExitToMenu,
  playerName,
  presenceKey,
  presenceStatus,
  roomCode,
  roomChannel,
}) {
  const [gameState, setGameState] = useState(buildNewGame)
  const [discardHistorySnapshot, setDiscardHistorySnapshot] = useState([])
  const [draggedCardId, setDraggedCardId] = useState(null)
  const [turnSeconds, setTurnSeconds] = useState(TURN_SECONDS)

  const currentPlayer = gameState.players[gameState.currentPlayerIndex]
  const myPlayerIndex = appMode === 'multiplayer' ? getPlayerIndexFromRole(myRole) : HUMAN_INDEX
  const controlledPlayerIndexes = useMemo(
    () => [myPlayerIndex, ...(appMode === 'multiplayer' && multiplayerBotEnabled && myRole === 'Player 1' ? [2] : [])],
    [appMode, multiplayerBotEnabled, myPlayerIndex, myRole],
  )
  const humanPlayer = gameState.players[myPlayerIndex]
  const selectedCards = useMemo(
    () => getSelectedCards(humanPlayer.hand, gameState.selectedCardIds),
    [gameState.selectedCardIds, humanPlayer.hand],
  )
  const topDiscard = gameState.discardPile.at(-1)
  const conservationStatus = validateCardConservation(gameState)
  const isHumanTurn = gameState.currentPlayerIndex === myPlayerIndex && gameState.phase !== 'gameOver'
  const selectedMeldStatus = validateMeld(selectedCards)
  const isGameLive = gameState.phase !== 'gameOver' && (appMode === 'solo' || multiplayerDealStarted)
  const handRenderGroups = useMemo(
    () => getHandRenderGroups(humanPlayer.hand, humanPlayer.handGroups),
    [humanPlayer.hand, humanPlayer.handGroups],
  )
  const selectedCardData = useMemo(
    () => ({
      cards: selectedCards,
      ids: selectedCards.map((card) => card.id),
      labels: selectedCards.map(formatCard),
    }),
    [selectedCards],
  )
  const canExposeSelection = isHumanTurn && gameState.phase === 'meld' && selectedMeldStatus.valid
  const canDiscardSelection = isHumanTurn && gameState.phase === 'meld' && gameState.selectedCardIds.length === 1
  const canGroupSelection = isHumanTurn && gameState.selectedCardIds.length > 1
  const opponentPlayers = gameState.players.filter((_, playerIndex) => playerIndex !== myPlayerIndex)
  const handCardCount = humanPlayer.hand.length
  const handScale = Math.max(0.76, Math.min(1, 1 - Math.max(handCardCount - 13, 0) * 0.035))
  const handOverlap = Math.min(42, Math.max(18, 18 + Math.max(handCardCount - 10, 0) * 3))

  const broadcastGameMove = useCallback(async (nextGameState, moveType = 'turn-step') => {
    if (appMode !== 'multiplayer' || !roomChannel) return
    const publicGameState = buildPublicGameState(nextGameState)

    try {
      const sendStatus = await roomChannel.send({
        event: 'game-move',
        payload: {
          gameState: publicGameState,
          publicGameState,
          moveType,
          playerName,
          playerRole: myRole,
          roomCode,
          sentAt: new Date().toISOString(),
        },
        type: 'broadcast',
      })

      if (sendStatus !== 'ok') console.error(`Unable to broadcast ${moveType}: ${sendStatus}`)
    } catch (error) {
      console.error(`Unable to broadcast ${moveType}.`, error)
    }
  }, [appMode, myRole, playerName, roomChannel, roomCode])

  const commitGameState = useCallback((reducer, moveType) => {
    setGameState((previousState) => {
      const nextGameState = reducer(previousState)

      if (appMode === 'solo') {
        assertCardConservation(nextGameState, moveType)
      } else {
        assertUniqueCardIds(getAllTrackedCards(nextGameState), `${moveType} known cards`)
      }

      if (appMode === 'multiplayer') {
        void broadcastGameMove(nextGameState, moveType)
      }

      return nextGameState
    })
  }, [appMode, broadcastGameMove])

  function openDiscardHistory() {
    setDiscardHistorySnapshot([...gameState.discardPile])
  }

  function closeDiscardHistory() {
    setDiscardHistorySnapshot([])
  }

  useEffect(() => {
    if (!gameState.newlyDrawnCardId) return undefined

    const timeoutId = window.setTimeout(() => {
      setGameState((previousState) => ({
        ...previousState,
        newlyDrawnCardId: null,
      }))
    }, 2600)

    return () => window.clearTimeout(timeoutId)
  }, [gameState.newlyDrawnCardId])

  useEffect(() => {
    if (appMode !== 'solo') return undefined
    if (gameState.phase === 'gameOver' || gameState.currentPlayerIndex === HUMAN_INDEX) return undefined

    const timeoutId = window.setTimeout(() => {
      setGameState((previousState) => runCpuTurn(previousState))
    }, 850)

    return () => window.clearTimeout(timeoutId)
  }, [appMode, gameState])

  useEffect(() => {
    const isHostBotTurn =
      appMode === 'multiplayer' &&
      multiplayerBotEnabled &&
      multiplayerDealStarted &&
      myRole === 'Player 1' &&
      gameState.phase !== 'gameOver' &&
      gameState.currentPlayerIndex === 2

    if (!isHostBotTurn) return undefined

    const timeoutId = window.setTimeout(() => {
      commitGameState((previousState) => runCpuTurn(previousState), 'computer-turn')
    }, 850)

    return () => window.clearTimeout(timeoutId)
  }, [
    appMode,
    commitGameState,
    gameState,
    multiplayerBotEnabled,
    multiplayerDealStarted,
    myRole,
  ])

  useEffect(() => {
    setTurnSeconds(TURN_SECONDS)
  }, [gameState.currentPlayerIndex, gameState.dealId])

  useEffect(() => {
    if (!isGameLive) return undefined

    const intervalId = window.setInterval(() => {
      setTurnSeconds((seconds) => Math.max(seconds - 1, 0))
    }, 1000)

    return () => window.clearInterval(intervalId)
  }, [isGameLive, gameState.currentPlayerIndex, gameState.dealId])

  useEffect(() => {
    if (!isGameLive || !isHumanTurn || turnSeconds > 0) return

    commitGameState((previousState) => runTimeoutMove(previousState, myPlayerIndex), 'timeout')
  }, [commitGameState, isGameLive, isHumanTurn, myPlayerIndex, turnSeconds])

  useEffect(() => {
    if (appMode !== 'multiplayer' || !roomChannel) return undefined

    let isListening = true

    function handleRemoteMove({ payload }) {
      if (!isListening) return
      if (!payload?.publicGameState && !payload?.gameState) return

      const publicGameState = payload.publicGameState ?? buildPublicGameState(payload.gameState)
      setGameState((previousState) =>
        mergePublicGameStateWithPrivateHand(previousState, publicGameState, controlledPlayerIndexes),
      )
      if (payload.moveType === 'initial-deal') onMultiplayerDealStarted(publicGameState.botPlayerIndex === 2)
    }

    roomChannel.on('broadcast', { event: 'game-move' }, handleRemoteMove)

    return () => {
      isListening = false
    }
  }, [appMode, controlledPlayerIndexes, onMultiplayerDealStarted, roomChannel])

  useEffect(() => {
    if (appMode !== 'multiplayer' || !presenceKey || !roomCode) return undefined

    let isListening = true
    const supabaseClient = getSupabaseClient()
    const privateChannel = supabaseClient.channel(`room:${roomCode}:private:${presenceKey}`)

    privateChannel.on('broadcast', { event: 'private-hand' }, ({ payload }) => {
      if (!isListening || !payload?.hand || !payload?.role) return

      const playerIndex = getPlayerIndexFromRole(payload.role)
      setGameState((previousState) => ({
        ...previousState,
        players: previousState.players.map((player, index) =>
          index === playerIndex && payload.dealId === previousState.dealId
            ? {
                ...player,
                hand: normalizeUniqueCards(payload.hand),
              }
            : player,
        ),
      }))
      onMultiplayerDealStarted(payload.botPlayerIndex === 2)
    })
    privateChannel.subscribe()

    return () => {
      isListening = false
      void supabaseClient.removeChannel(privateChannel)
    }
  }, [appMode, onMultiplayerDealStarted, presenceKey, roomCode])

  async function startMultiplayerDeal(useComputer = multiplayerBotEnabled) {
    const requiredPlayerCount = useComputer ? 2 : 3
    if (appMode !== 'multiplayer' || myRole !== 'Player 1' || connectedPlayers.length !== requiredPlayerCount) return

    const initialGameState = {
      ...buildNewGame(),
      botPlayerIndex: useComputer ? 2 : null,
    }
    const locallyControlledIndexes = [myPlayerIndex, ...(useComputer ? [2] : [])]
    const visibleInitialState = maskGameStateForViewer(initialGameState, locallyControlledIndexes)

    setGameState(visibleInitialState)
    onMultiplayerDealStarted(useComputer)
    await broadcastGameMove(initialGameState, 'initial-deal')
    await Promise.all(
      connectedPlayers.filter((player) => player.key !== presenceKey).map((player) =>
        sendPrivateHandToSeat(
          roomCode,
          player.key,
          initialGameState.players[getPlayerIndexFromRole(player.role)].hand,
          player.role,
          initialGameState.dealId,
          initialGameState.botPlayerIndex,
        ),
      ),
    )
  }

  function toggleSelectedCard(cardId) {
    if (!isHumanTurn || gameState.phase === 'preDraw') return

    setGameState((previousState) => {
      const selectedCardIds = previousState.selectedCardIds.includes(cardId)
        ? previousState.selectedCardIds.filter((selectedId) => selectedId !== cardId)
        : [...previousState.selectedCardIds, cardId]

      return {
        ...previousState,
        newlyDrawnCardId: null,
        selectedCardIds,
      }
    })
  }

  function autoSortHand() {
    setGameState((previousState) => ({
      ...previousState,
      players: previousState.players.map((player, playerIndex) =>
        playerIndex === myPlayerIndex
          ? (() => {
              const sorted = handleAutoSort(player.hand)

              return {
                ...player,
                hand: sorted.hand,
                handGroups: sorted.handGroups,
              }
            })()
          : player,
      ),
      newlyDrawnCardId: null,
      selectedCardIds: [],
    }))
  }

  function groupSelectedCards() {
    if (!canGroupSelection) return

    setGameState((previousState) => ({
      ...previousState,
      players: previousState.players.map((player, playerIndex) =>
        playerIndex === myPlayerIndex
          ? (() => {
              const selectedCardIds = new Set(previousState.selectedCardIds)
              const selectedGroupCards = player.hand.filter((card) => selectedCardIds.has(card.id))
              const unselectedCards = player.hand.filter((card) => !selectedCardIds.has(card.id))
              const firstSelectedIndex = player.hand.findIndex((card) => selectedCardIds.has(card.id))
              const insertIndex = Math.min(Math.max(firstSelectedIndex, 0), unselectedCards.length)
              const hand = [
                ...unselectedCards.slice(0, insertIndex),
                ...selectedGroupCards,
                ...unselectedCards.slice(insertIndex),
              ]
              const handGroups = [
                ...pruneHandGroups(player.handGroups, hand).filter(
                  (group) => !group.cardIds.some((cardId) => selectedCardIds.has(cardId)),
                ),
                createHandGroup('manual', selectedGroupCards),
              ]

              return {
                ...player,
                hand,
                handGroups,
              }
            })()
          : player,
      ),
      newlyDrawnCardId: null,
    }))
  }

  function moveDraggedCard(targetCardId) {
    if (!draggedCardId || draggedCardId === targetCardId) return

    setGameState((previousState) => ({
      ...previousState,
      players: previousState.players.map((player, playerIndex) =>
        playerIndex === myPlayerIndex
          ? (() => {
              const hand = moveCardInHand(player.hand, draggedCardId, targetCardId)

              return {
                ...player,
                hand,
                handGroups: pruneHandGroups(player.handGroups, hand),
              }
            })()
          : player,
      ),
      newlyDrawnCardId: null,
    }))
    setDraggedCardId(null)
  }

  return (
    <main className="game-shell">
      <div className={`game-layout ${appMode === 'solo' || multiplayerDealStarted ? 'with-sidebar' : 'table-only'}`}>
        {(appMode === 'solo' || multiplayerDealStarted) && (
          <aside className="game-sidebar" aria-label="Player status and game log">
            <section className="sidebar-card" aria-label="Current table status">
              <div>
                <span>Identity</span>
                <strong>{playerName || 'Player 1'}</strong>
              </div>
              <div>
                <span>Selected</span>
                <strong>{selectedCardData.labels.length ? selectedCardData.labels.join(' ') : 'None'}</strong>
              </div>
              <div>
                <span>Deadwood</span>
                <strong>{calculateDeadwood(humanPlayer.hand)}</strong>
              </div>
              <div>
                <span>{appMode === 'solo' ? 'Tracked' : 'Known'}</span>
                <strong>{conservationStatus.isValid ? '52/52' : `${conservationStatus.totalCards}/52`}</strong>
              </div>
            </section>

            <section className="sidebar-card score-stack" aria-label="Player scores">
              {gameState.players.map((player, playerIndex) => (
                <div className={player.seatIndex === gameState.currentPlayerIndex ? 'active-score' : ''} key={player.name}>
                  <span>{player.name}</span>
                  <strong>{playerIndex === myPlayerIndex ? calculateDeadwood(player.hand) : 'Hidden'}</strong>
                </div>
              ))}
            </section>

            <section className="sidebar-card log-stack" aria-label="Game log">
              <span>Game Log</span>
              <div>
                {gameState.log.map((entry, index) => (
                  <p key={`${entry}-${index}`}>{entry}</p>
                ))}
              </div>
            </section>
          </aside>
        )}

        <section className="table" aria-label="Tongits card table">
        <header className="room-bar">
          <span className="room-label">Room Code</span>
          <strong>{roomCode}</strong>
          <span className="room-label">{appMode === 'solo' ? 'Solo Bots' : `Multiplayer Ready · ${myRole}`}</span>
          <button
            className="new-game-button"
            disabled={appMode === 'multiplayer' && myRole !== 'Player 1'}
            onClick={() => {
              if (appMode === 'multiplayer') {
                startMultiplayerDeal(multiplayerBotEnabled)
                return
              }

              setGameState(buildNewGame())
            }}
            type="button"
          >
            New Game
          </button>
          <button className="new-game-button secondary" onClick={onExitToMenu} type="button">
            Lobby
          </button>
        </header>

        {appMode === 'multiplayer' && !multiplayerDealStarted ? (
          <section className="waiting-lounge" aria-label="Multiplayer waiting lounge">
            <span className="lounge-kicker">Waiting Lounge</span>
            <strong>{roomCode}</strong>
            <p>{presenceStatus}</p>
            <div className="connected-list">
              {connectedPlayers.map((player) => (
                <div className="connected-player" key={player.key}>
                  <span>{player.role}</span>
                  <strong>{player.name}</strong>
                </div>
              ))}
              {Array.from({ length: Math.max(3 - connectedPlayers.length, 0) }).map((_, index) => (
                <div className="connected-player empty" key={`empty-seat-${index}`}>
                  <span>{roleForPresenceIndex(connectedPlayers.length + index)}</span>
                  <strong>{connectedPlayers.length === 2 && index === 0 ? 'Waiting or Computer' : 'Waiting...'}</strong>
                </div>
              ))}
            </div>
            {connectedPlayers.length >= 2 && (
              <button
                className="start-deal-button"
                disabled={myRole !== 'Player 1'}
                onClick={() => startMultiplayerDeal(connectedPlayers.length === 2)}
                type="button"
              >
                {connectedPlayers.length === 2 ? 'Start With Computer' : 'Start Deal'}
              </button>
            )}
          </section>
        ) : (
          <>
        <section className="board-grid" aria-label="Opponent and commons area">
          <section className="board-sector opponent-sector" aria-label="Player 2 area">
            {opponentPlayers[0] && (
              <section className="seat opponent" key={opponentPlayers[0].name}>
                <div className="avatar">{opponentPlayers[0].name.replace('Player ', 'P')}</div>
                <div>
                  <p>{opponentPlayers[0].name}</p>
                  <span>Hidden hand</span>
                  <div className="opponent-card-backs" aria-label={`${opponentPlayers[0].name} hidden cards`}>
                    <i />
                    <i />
                    <i />
                  </div>
                  <div className="seat-flags">
                    {opponentPlayers[0].isOpened && <b>Opened</b>}
                    {opponentPlayers[0].isSapawed && <b>Sapawed</b>}
                    {opponentPlayers[0].isBurned && <b>Burned</b>}
                  </div>
                </div>
              </section>
            )}
          </section>

          <section className="commons" aria-label="Commons area">
            <div className="turn-indicator">
              <span>{gameState.phase === 'gameOver' ? 'Game Over' : `Phase: ${gameState.phase}`}</span>
              <strong>{currentPlayer.name}</strong>
            </div>

            <div
              className={`turn-timer ${turnSeconds <= 10 ? 'danger' : ''}`}
              style={{ '--timer-progress': `${(turnSeconds / TURN_SECONDS) * 100}%` }}
            >
              <span>Turn Timer</span>
              <strong>{turnSeconds}s</strong>
              <i />
            </div>

            <div className="pile-row">
              <button
                className="pile draw-pile"
                disabled={!isHumanTurn || gameState.phase !== 'preDraw'}
                onClick={() => commitGameState((previousState) => drawFromStock(previousState, myPlayerIndex), 'draw-stock')}
                type="button"
              >
                <span className="card-back"></span>
                <span className="pile-title">Stock Pile</span>
                <strong>{gameState.stockPile.length}</strong>
              </button>

              <button
                className="pile discard-pile"
                disabled={!isHumanTurn || gameState.phase !== 'preDraw' || !topDiscard}
                onClick={() => commitGameState((previousState) => drawFromDiscard(previousState, myPlayerIndex), 'draw-discard')}
                type="button"
              >
                {topDiscard ? (
                  <div className={`card discard-card ${isRedSuit(topDiscard) ? 'red' : 'black'}`}>
                    <span>{topDiscard.rank}</span>
                    <strong>{topDiscard.suit}</strong>
                  </div>
                ) : (
                  <div className="empty-discard">Empty</div>
                )}
                <span className="pile-title">Discard Pile</span>
                <strong>{gameState.discardPile.length}</strong>
              </button>
            </div>

            <p className="status-message">{gameState.message}</p>
          </section>

          <section className="board-sector right-sector" aria-label="Player 3 and exposed melds">
            {opponentPlayers[1] && (
              <section className="seat opponent" key={opponentPlayers[1].name}>
                <div className="avatar">{opponentPlayers[1].name.replace('Player ', 'P')}</div>
                <div>
                  <p>{opponentPlayers[1].name}</p>
                  <span>Hidden hand</span>
                  <div className="opponent-card-backs" aria-label={`${opponentPlayers[1].name} hidden cards`}>
                    <i />
                    <i />
                    <i />
                  </div>
                  <div className="seat-flags">
                    {opponentPlayers[1].isOpened && <b>Opened</b>}
                    {opponentPlayers[1].isSapawed && <b>Sapawed</b>}
                    {opponentPlayers[1].isBurned && <b>Burned</b>}
                  </div>
                </div>
              </section>
            )}

            <section className="meld-board" aria-label="Exposed melds">
              {gameState.players.map((player, playerIndex) => (
                <div className="meld-owner" key={player.name}>
                  <h2>{player.name} Melds</h2>
                  {player.exposedMelds.length === 0 ? (
                    <p>No exposed melds</p>
                  ) : (
                    player.exposedMelds.map((meld, meldIndex) => (
                      <button
                        className="meld-row"
                        disabled={!isHumanTurn || gameState.phase !== 'meld' || gameState.selectedCardIds.length !== 1}
                        key={`${player.name}-${meldIndex}`}
                        onClick={() =>
                          commitGameState(
                            (previousState) => sapawSelectedCard(previousState, playerIndex, meldIndex),
                            'sapaw',
                          )
                        }
                        type="button"
                      >
                        {meld.map((card) => (
                          <MiniCard card={card} key={card.id} />
                        ))}
                        <span>Sapaw</span>
                      </button>
                    ))
                  )}
                </div>
              ))}
            </section>
          </section>
        </section>

        <section className="action-bar" aria-label="Game actions">
          <button disabled={gameState.discardPile.length === 0} onClick={openDiscardHistory} type="button">
            View Discards
          </button>
          <button disabled={!isHumanTurn} onClick={autoSortHand} type="button">
            Auto-Sort
          </button>
          {canGroupSelection && (
            <button onClick={groupSelectedCards} type="button">
              Group Selected
            </button>
          )}
          {isHumanTurn && gameState.phase === 'preDraw' && canCallDraw(humanPlayer) && (
            <button onClick={() => commitGameState((previousState) => callDraw(previousState, myPlayerIndex), 'call-draw')} type="button">
              Call Draw
            </button>
          )}
          {selectedCards.length > 0 && (
            <button
              disabled={!canExposeSelection}
              onClick={() => commitGameState((previousState) => exposeSelectedMeld(previousState, myPlayerIndex), 'meld')}
              type="button"
            >
              Expose Meld
            </button>
          )}
          {gameState.selectedCardIds.length === 1 && (
            <button
              disabled={!canDiscardSelection}
              onClick={() => commitGameState((previousState) => discardSelectedCard(previousState, myPlayerIndex), 'discard')}
              type="button"
            >
              Discard Selected
            </button>
          )}
        </section>

        {gameState.winner && (
          <section className="winner-panel">
            <span>{gameState.winner.reason}</span>
            <strong>{gameState.players[gameState.winner.playerIndex].name} wins</strong>
            <p>
              Scores: {gameState.winner.scores.map((score, index) => `${PLAYER_NAMES[index]} ${score}`).join(' · ')}
            </p>
          </section>
        )}

        <section className="player-seat" aria-label="Your hand">
          <div
            className="hand"
            style={{
              '--card-scale': handScale,
              '--hand-overlap': `${handOverlap}px`,
            }}
          >
            {handRenderGroups.map((group) => (
              <div className={`hand-group ${group.type}`} key={group.id}>
                {group.cards.map((card, index) => (
                  <CardButton
                    card={card}
                    className={`hand-card ${gameState.newlyDrawnCardId === card.id ? 'newly-drawn' : ''}`}
                    draggable
                    isSelected={gameState.selectedCardIds.includes(card.id)}
                    key={card.id}
                    onClick={() => toggleSelectedCard(card.id)}
                    onDragEnd={() => setDraggedCardId(null)}
                    onDragOver={(event) => event.preventDefault()}
                    onDragStart={(event) => {
                      setDraggedCardId(card.id)
                      event.dataTransfer.effectAllowed = 'move'
                    }}
                    onDrop={(event) => {
                      event.preventDefault()
                      moveDraggedCard(card.id)
                    }}
                    style={{ '--card-index': index }}
                  />
                ))}
              </div>
            ))}
          </div>
        </section>

        <DiscardHistoryModal cards={discardHistorySnapshot} onClose={closeDiscardHistory} />
          </>
        )}
      </section>
      </div>
    </main>
  )
}

function LobbyMenu({
  joinCode,
  lobbyError,
  onConfirmJoin,
  onCreateRoom,
  onJoinCodeChange,
  onPlaySolo,
  onPlayerNameChange,
  onShowJoin,
  playerName,
  showJoinRoom,
}) {
  const hasName = playerName.trim().length > 0
  const hasJoinCode = joinCode.trim().length === 4

  return (
    <main className="lobby-shell">
      <section className="lobby-card" aria-label="Tongits lobby">
        <div className="lobby-kicker">Private Casino Table</div>
        <h1>Pa-tongits ni konsi</h1>
        <p className="lobby-copy">Enter your player name, then choose a solo table or prepare a private room.</p>

        <label className="lobby-field">
          <span>Player Name</span>
          <input
            autoComplete="nickname"
            maxLength={18}
            onChange={(event) => onPlayerNameChange(event.target.value)}
            placeholder="Your table name"
            type="text"
            value={playerName}
          />
        </label>

        {lobbyError && <p className="lobby-error">{lobbyError}</p>}

        <div className="lobby-actions">
          <button disabled={!hasName} onClick={onPlaySolo} type="button">
            <span>Solo Mode</span>
            Play Against Computer
          </button>
          <button disabled={!hasName} onClick={onCreateRoom} type="button">
            <span>Host Mode</span>
            Create New Room
          </button>
          <button disabled={!hasName} onClick={onShowJoin} type="button">
            <span>Guest Mode</span>
            Join Friend&apos;s Room
          </button>
        </div>

        {showJoinRoom && (
          <div className="join-panel">
            <label className="lobby-field compact">
              <span>Room Code</span>
              <input
                inputMode="text"
                maxLength={4}
                onChange={(event) => onJoinCodeChange(normalizeRoomCode(event.target.value))}
                placeholder="ABCD"
                type="text"
                value={joinCode}
              />
            </label>
            <button disabled={!hasName || !hasJoinCode} onClick={onConfirmJoin} type="button">
              Confirm Join
            </button>
          </div>
        )}
      </section>
    </main>
  )
}

function App() {
  const [appMode, setAppMode] = useState('menu')
  const [playerName, setPlayerName] = useState('')
  const [roomCode, setRoomCode] = useState('SOLO')
  const [myRole, setMyRole] = useState('Player 1')
  const [connectedPlayers, setConnectedPlayers] = useState([])
  const [presenceKey] = useState(() => createPresenceKey('guest'))
  const [presenceStatus, setPresenceStatus] = useState('Supabase Presence is idle.')
  const [roomChannel, setRoomChannel] = useState(null)
  const [multiplayerDealStarted, setMultiplayerDealStarted] = useState(false)
  const [multiplayerBotEnabled, setMultiplayerBotEnabled] = useState(false)
  const [isRoomCreator, setIsRoomCreator] = useState(false)
  const [showJoinRoom, setShowJoinRoom] = useState(false)
  const [joinCode, setJoinCode] = useState('')
  const [lobbyError, setLobbyError] = useState('')

  useEffect(() => {
    if (appMode !== 'multiplayer') {
      setConnectedPlayers([])
      setRoomChannel(null)
      setPresenceStatus('Supabase Presence is idle.')
      return undefined
    }

    let isMounted = true
    let roomChannel = null
    let supabaseClient = null
    const joinedAt = new Date().toISOString()
    const isHost = isRoomCreator

    async function connectToRoomPresence() {
      setPresenceStatus('Connecting to room presence...')

      try {
        supabaseClient = await getSupabaseClient()
        if (!isMounted) return

        roomChannel = supabaseClient.channel(`room:${roomCode}`, {
          config: {
            presence: {
              key: presenceKey,
            },
          },
        })
        setRoomChannel(roomChannel)

        function syncConnectedPlayers() {
          if (!roomChannel || !isMounted) return

          const presenceState = roomChannel.presenceState()
          const uniquePlayers = Object.entries(presenceState)
            .map(([key, metas]) => {
              const latestMeta = metas.at(-1) ?? {}

              return {
                isHost: Boolean(latestMeta.isHost),
                joinedAt: latestMeta.joinedAt ?? '',
                key,
                name: latestMeta.playerName || 'Guest',
              }
            })
            .sort((first, second) => {
              if (first.isHost !== second.isHost) return first.isHost ? -1 : 1

              return first.joinedAt.localeCompare(second.joinedAt)
            })
            .slice(0, 3)
            .map((player, index) => ({
              ...player,
              role: roleForPresenceIndex(index),
            }))

          setConnectedPlayers(uniquePlayers)

          const currentPresence = uniquePlayers.find((player) => player.key === presenceKey)
          if (currentPresence) setMyRole(currentPresence.role)
        }

        roomChannel.on('presence', { event: 'sync' }, syncConnectedPlayers)
        roomChannel.subscribe(async (status) => {
          if (!isMounted || !roomChannel) return

          if (status === 'SUBSCRIBED') {
            await roomChannel.track({
              isHost,
              joinedAt,
              playerName: playerName.trim(),
              roomCode,
            })
            setPresenceStatus('Connected. Waiting for players or a two-player start with a computer.')
          }

          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            setPresenceStatus(`Presence channel status: ${status}`)
          }
        })
      } catch (error) {
        if (!isMounted) return

        setConnectedPlayers([
          {
            isHost,
            joinedAt,
            key: presenceKey,
            name: playerName.trim() || 'Guest',
            role: isHost ? 'Player 1' : 'Player 2',
          },
        ])
        setPresenceStatus(error instanceof Error ? error.message : 'Unable to connect to Supabase Presence.')
      }
    }

    connectToRoomPresence()

    return () => {
      isMounted = false
      setConnectedPlayers([])
      setRoomChannel(null)

      if (roomChannel && supabaseClient) {
        void roomChannel.untrack()
        void supabaseClient.removeChannel(roomChannel)
      }
    }
  }, [appMode, isRoomCreator, playerName, presenceKey, roomCode])

  function requirePlayerName() {
    if (playerName.trim()) {
      setLobbyError('')
      return true
    }

    setLobbyError('Enter your player name before taking a seat.')
    return false
  }

  function startSoloGame() {
    if (!requirePlayerName()) return

    setRoomCode('SOLO')
    setMyRole('Player 1')
    setIsRoomCreator(false)
    setMultiplayerBotEnabled(false)
    setAppMode('solo')
  }

  function createRoom() {
    if (!requirePlayerName()) return

    setRoomCode(generateRoomCode())
    setMyRole('Player 1')
    setIsRoomCreator(true)
    setConnectedPlayers([])
    setMultiplayerDealStarted(false)
    setMultiplayerBotEnabled(false)
    setAppMode('multiplayer')
  }

  function confirmJoin() {
    if (!requirePlayerName()) return
    if (joinCode.length !== 4) {
      setLobbyError('Enter a 4-character room code.')
      return
    }

    setRoomCode(joinCode)
    setMyRole('Player 2')
    setIsRoomCreator(false)
    setConnectedPlayers([])
    setMultiplayerDealStarted(false)
    setMultiplayerBotEnabled(false)
    setAppMode('multiplayer')
  }

  function returnToLobby() {
    setAppMode('menu')
    setLobbyError('')
    setMultiplayerDealStarted(false)
    setMultiplayerBotEnabled(false)
  }

  const handleMultiplayerDealStarted = useCallback((useComputer = false) => {
    setMultiplayerBotEnabled(useComputer)
    setMultiplayerDealStarted(true)
  }, [])

  if (appMode === 'menu') {
    return (
      <LobbyMenu
        joinCode={joinCode}
        lobbyError={lobbyError}
        onConfirmJoin={confirmJoin}
        onCreateRoom={createRoom}
        onJoinCodeChange={setJoinCode}
        onPlaySolo={startSoloGame}
        onPlayerNameChange={(value) => {
          setPlayerName(value)
          if (value.trim()) setLobbyError('')
        }}
        onShowJoin={() => {
          if (!requirePlayerName()) return
          setShowJoinRoom(true)
        }}
        playerName={playerName}
        showJoinRoom={showJoinRoom}
      />
    )
  }

  return (
    <TongitsGame
      appMode={appMode}
      connectedPlayers={connectedPlayers}
      multiplayerBotEnabled={multiplayerBotEnabled}
      multiplayerDealStarted={multiplayerDealStarted}
      myRole={myRole}
      onExitToMenu={returnToLobby}
      onMultiplayerDealStarted={handleMultiplayerDealStarted}
      playerName={playerName}
      presenceStatus={presenceStatus}
      roomCode={roomCode}
      roomChannel={roomChannel}
    />
  )
}

export default App
