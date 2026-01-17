# Impostor

A multiplayer social deduction party game. One player is the Impostor who must blend in, while everyone else tries to identify them through word association.

**Play now at [impostorhunt.com](https://www.impostorhunt.com)**

<p align="center">
  <img width="1616" height="1098" alt="home_page" src="https://github.com/user-attachments/assets/6935cc1b-a4fc-4b19-ba4f-c89fcc1c418b" />
</p>


## How It Works

**Roles:** Everyone (the crew) receives a Topic and Secret Word. The Impostor only sees the Topic.

**Turns:** Players take turns saying one word related to the secret to prove they know it.

**Deduction:** The Impostor must blend in by guessing from context clues. The crew votes to identify the Impostor.

<p align="center">
<img width="278" alt="reveal" src="https://github.com/user-attachments/assets/33515390-8ba4-4439-bf7e-0629d067816f" />
<img width="285" alt="imposter" src="https://github.com/user-attachments/assets/f2a9fef2-b1d7-4857-bbb2-346c96fa7b30" />
<img width="282"alt="crew" src="https://github.com/user-attachments/assets/865f1be4-1dff-45b5-8dfb-aa4a7a02c152" />


</p>

## Game Modes

- **Pass to Play** - Offline mode, pass the device around
- **Online Multiplayer** - Host a lobby and share the PIN with friends

<p align="center">
<img height="748" alt="image" src="https://github.com/user-attachments/assets/2bd054b9-2f10-478f-8b78-2207959d9166" />
</p>

## Optional Twists

- **Jester Role** - Wins by getting voted out
- **Hard Mode** - Crew only sees the word, Impostor only sees the topic
- **Hint Word** - Impostor receives a subtle hint

## Tech Stack

- **Frontend:** JavaScript, Tailwind CSS
- **Backend:** Node.js, Express
- **Real-time:** Socket.IO
- **Deployment:** Docker, Fly.io

## Development

```bash
# Install dependencies
npm install

# Create .env file from template
cp .env.example .env

# Start the server
node server.js
```

## Contributing

Contributions welcome! Submit a PR or use the [feedback form](https://docs.google.com/forms/d/e/1FAIpQLSepoBf-Up4bpz0NGYdUYtFnvL414JmdVIz-WZ-btyA-fyDmHA/viewform) if you find bugs or have suggestions.
