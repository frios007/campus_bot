import { createFileRoute } from "@tanstack/react-router";
import { ChatWindow } from "#/components/chat/ChatWindow";

export const Route = createFileRoute("/")({ component: ChatWindow });
