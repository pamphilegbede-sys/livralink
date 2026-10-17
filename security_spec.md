# Spécification de Sécurité LivraLink (Zero-Trust Security Architecture)

## 1. Invariants de Données (Data Invariants)

1. **Isolation Stricte des Utilisateurs (Tenant & PII Isolation)** :
   - Un utilisateur ne peut lire, modifier ou créer que son propre document dans `/users/{userId}` (`userId == request.auth.uid`).
   - Le listing complet de la collection `/users` est formellement interdit (`allow list: if false`) pour empêcher le moissonnage (scraping) de données personnelles (téléphones, noms, adresses).

2. **Interdiction Totale d'Auto-Élévation de Privilèges (Anti-Privilege Escalation)** :
   - À l'inscription, un utilisateur ordinaire ne peut choisir QUE le rôle `vendeur` ou `livreur`. Le rôle `admin` est formellement rejeté sauf si le demandeur est le Super-Administrateur vérifié (`request.auth.token.email == 'pamphile.gbede@gmail.com' && request.auth.token.email_verified == true`).
   - Lors d'une mise à jour de profil, le champ `role`, l'identifiant `uid` et l'adresse `email` sont immuables (`incoming().role == existing().role`).

3. **Protection contre les Champs Fantômes (Strict Key Whitelisting)** :
   - Les documents rejetteront systématiquement toute injection de champs non déclarés dans le blueprint grâce aux clauses `.keys().hasOnly([...])` et `diff().affectedKeys().hasOnly([...])`.

4. **Contrôle d'Intégrité des Livraisons (Delivery Lifecycle & Anti-Tampering)** :
   - Seul un marchand authentifié (ou Super-Admin) peut créer une course, avec `merchantId == request.auth.uid`.
   - À la création, le statut doit obligatoirement être `en_attente`. Aucun utilisateur ne peut créer une course directement au statut `livree` ou `acceptee`.
   - Les coursiers ne peuvent accepter qu'une course libre (`status == 'en_attente'`) en renseignant leur propre UID (`courierId == request.auth.uid`).
   - Verrouillage d'état terminal : Une course marquée `livree` ou `echec` est verrouillée contre toute modification ultérieure (Terminal State Locking), seul le Super-Admin pouvant intervenir en cas de litige.

5. **Mitigation du Déni de Portefeuille (Denial of Wallet Defense)** :
   - Toutes les chaînes de caractères ont une taille maximale strictement bornée (`size() <= 128` ou `size() <= 32`).
   - Tous les identifiants de documents respectent `isValidId` (regex alphanumérique, max 128 caractères).

---

## 2. Les « Douze Payloads Malveillants » (The Dirty Dozen Payloads)

Chacun de ces payloads d'attaque a été conçu pour tenter d'enfreindre les lois d'identité, d'intégrité ou d'état de l'application et **DOIT** échouer avec `PERMISSION_DENIED` ou rejet d'API :

1. **Attaque 1 (Privilege Escalation)** : Inscription d'un utilisateur avec `role: "admin"`.
   - Payload: `{"uid": "attacker_123", "email": "hacker@evil.com", "fullName": "Fake Admin", "phone": "+22900000000", "role": "admin"}`
   - Règle de rejet: `incoming().role in ['vendeur', 'livreur'] || (incoming().role == 'admin' && isAdmin())` -> **REJETÉ (403/PERMISSION_DENIED)**.

2. **Attaque 2 (Ghost Field Injection / Shadow Update)** : Ajout d'un champ non autorisé `isAdmin: true` ou `isSuperUser: true`.
   - Payload: `{"uid": "user_1", "email": "user@test.com", "fullName": "Jean", "phone": "+229123456", "role": "vendeur", "isAdmin": true}`
   - Règle de rejet: `data.keys().hasOnly(['uid', 'email', 'fullName', 'phone', 'role', ...])` -> **REJETÉ**.

3. **Attaque 3 (Identity Spoofing on User Profile)** : Écriture dans le profil d'une autre victime (`userId != auth.uid`).
   - Cible: `/users/victim_999` par attaquant `attacker_123`.
   - Règle de rejet: `isOwner(userId)` -> **REJETÉ**.

4. **Attaque 4 (State Shortcutting on Delivery Creation)** : Création d'une livraison directement pré-marquée `livree`.
   - Payload: `{"id": "LL-9999", "clientName": "Test", "clientPhone": "+22997000000", "status": "livree", "deliveryFee": 1500, "merchantId": "user_1"}`
   - Règle de rejet: `incoming().status == 'en_attente'` -> **REJETÉ**.

5. **Attaque 5 (Cross-Merchant Order Creation)** : Un marchand tente de créer une commande au nom d'un autre marchand.
   - Payload: `{"id": "LL-1111", "merchantId": "other_vendor_uid", "clientName": "Target", "clientPhone": "+22990000000", "status": "en_attente", "deliveryFee": 2000}`
   - Règle de rejet: `incoming().merchantId == request.auth.uid` -> **REJETÉ**.

6. **Attaque 6 (Terminal State Tampering)** : Modification d'une course déjà livrée pour changer le montant COD ou le statut.
   - Payload de mise à jour: `{"itemValueCOD": 0, "status": "annulee"}` sur une course avec `status == 'livree'`.
   - Règle de rejet: `!(existing().status in ['livree', 'echec']) || isAdmin()` -> **REJETÉ**.

7. **Attaque 7 (Courier Cross-Assignment Hijack)** : Un coursier tente de s'attribuer une course déjà prise par un collègue coursier.
   - Payload: mise à jour de `courierId` sur une course ayant déjà `courierId == "other_courier"`.
   - Règle de rejet: `existing().status == 'en_attente' && incoming().courierId == request.auth.uid` -> **REJETÉ**.

8. **Attaque 8 (ID Poisoning / Buffer Injection)** : Injection d'un ID de document malveillant de 2 Mo avec injection de code.
   - Path: `/deliveries/<script>alert(1)</script>` ou 2000 caractères répétés.
   - Règle de rejet: `isValidId(deliveryId)` (regex `^[a-zA-Z0-9_\-]+$` et taille <= 128) -> **REJETÉ**.

9. **Attaque 9 (Denial of Wallet String Bomb)** : Envoi d'un nom de client contenant 500 Ko de texte.
   - Payload: `clientName: "A".repeat(500000)`.
   - Règle de rejet: `data.clientName.size() <= 128` -> **REJETÉ**.

10. **Attaque 10 (Mass Scraping / Public List Query)** : Requête de listage sans authentification ou sur tous les profils d'utilisateurs.
    - Requête: `getDocs(collection(db, 'users'))`.
    - Règle de rejet: `allow list: if isAdmin()` -> **REJETÉ**.

11. **Attaque 11 (Unverified Email Admin Spoofing)** : Requête prétendant être l'administrateur avec un token où `email_verified == false`.
    - Context: `request.auth.token.email == 'pamphile.gbede@gmail.com'` mais `email_verified: false`.
    - Règle de rejet: `request.auth.token.email_verified == true` obligatoire -> **REJETÉ**.

12. **Attaque 12 (Role Tampering on Existing Profile)** : Tentative de modification du rôle d'un vendeur en `admin` sur son propre profil.
    - Payload de mise à jour: `{"role": "admin"}`.
    - Règle de rejet: `incoming().role == existing().role` -> **REJETÉ**.

---

## 3. Matrice de Validation
Tous les 12 cas d'attaque sont couverts dans la suite de tests automatisée `test-security.ts`.
