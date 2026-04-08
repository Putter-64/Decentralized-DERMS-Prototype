import type { Session } from '@inrupt/solid-client-authn-browser';

const baseURI = import.meta.env.VITE_BASE_URI;

export class WebSocketService {
  private websockets = new Map<string, WebSocket>();
  private onMessageCallbacks = new Map<string, (message: any) => void>();

  async connect(
    topic: string,
    onMessage: (message: any) => void,
    session: Session
  ): Promise<void> {
    try {
      this.disconnect(topic);
      this.onMessageCallbacks.set(topic, onMessage);

      const websocketURL = await this.getWebsocketLink(topic, session);

      const websocket = new WebSocket(websocketURL, ['solid-0.1']);
      this.websockets.set(topic, websocket);

      websocket.addEventListener('open', () => {
        console.log('WebSocket connected');
      });

      websocket.addEventListener('message', (message: any) => {
        try {
          const modifiedMessage = JSON.parse(message.data);
          this.onMessageCallbacks.get(topic)?.(modifiedMessage);
        } catch (error) {
          console.error('Failed to process message:', error);
        }
      });

      websocket.addEventListener('error', (error) => {
        console.error('WebSocket error:', error);
      });

      websocket.addEventListener('close', () => {
        console.log('WebSocket disconnected');
        this.websockets.delete(topic);
        this.onMessageCallbacks.delete(topic);
      });
    } catch (error) {
      console.error('Failed to establish WebSocket connection:', error);
      throw error;
    }
  }

  disconnect(topic?: string): void {
    if (topic) {
      const websocket = this.websockets.get(topic);
      if (websocket) {
        websocket.close();
        this.websockets.delete(topic);
      }
      this.onMessageCallbacks.delete(topic);
      return;
    }

    this.websockets.forEach((ws) => ws.close());
    this.websockets.clear();
    this.onMessageCallbacks.clear();
  }

  private async getWebsocketLink(resourceUrl: string, session: Session): Promise<string> {
    const response = await session.fetch(`${baseURI}/.notifications/WebSocketChannel2023/`, {
      method: 'POST',
      headers: {
        'content-type': 'application/ld+json',
      },
      body: JSON.stringify({
        '@context': ['https://www.w3.org/ns/solid/notification/v1'],
        type: 'http://www.w3.org/ns/solid/notifications#WebSocketChannel2023',
        topic: resourceUrl,
      }),
    });

    const jsonResponse = await response.json();
    return jsonResponse['receiveFrom'];
  }
}
