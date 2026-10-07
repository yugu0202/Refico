UPDATE spaces SET name = 'マイスペース'
WHERE id = 'personal:' || owner_user_id AND name = '自分の在庫';
