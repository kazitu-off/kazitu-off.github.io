import { getSession, endSession } from "./backend.js";
export function getUser() { try { return JSON.parse(sessionStorage.getItem("discord_user") || "null"); } catch { return null; } }
export function login() { location.assign("/auth/discord"); }
export async function logout() { try { await endSession(); } catch { /* backend may already be unavailable */ } sessionStorage.removeItem("discord_user"); sessionStorage.removeItem("discord_user_id"); location.assign("#/" ); location.reload(); }
export async function loadAuth() { try { const { user } = await getSession(); if (user) { sessionStorage.setItem("discord_user", JSON.stringify(user)); sessionStorage.setItem("discord_user_id", user.id); } else { sessionStorage.removeItem("discord_user"); sessionStorage.removeItem("discord_user_id"); } return user || null; } catch (error) { if (error.status === 404 || error.status === 405 || error instanceof TypeError) return null; throw error; } }
