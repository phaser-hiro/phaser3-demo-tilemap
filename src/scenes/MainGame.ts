interface CustomProp {
    name: string;
    type: string;
    value: string;
}

export default class MainGame extends Phaser.Scene {
    //プロパティ
    private pickedkeyCount: number;
    private isJumping: boolean;

    private tilemap: Phaser.Tilemaps.Tilemap;
    private tileset: Phaser.Tilemaps.Tileset;
    private platform: Phaser.Tilemaps.TilemapLayer;
    private objectsLayer: Phaser.Tilemaps.ObjectLayer;
    private player: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
    private goalCollider: Phaser.Physics.Arcade.Collider
    private cursor: Phaser.Types.Input.Keyboard.CursorKeys;
    private keyGroup: Phaser.Physics.Arcade.Group;
    private gemGroup: Phaser.Physics.Arcade.Group;

    constructor() {
        super({ key: 'MainGame' });
    }

    init() {
        // リスタートした時のためにプロパティの初期化が必要
        this.pickedkeyCount = 0;
        this.isJumping = false;
    }

    preload() {
        this.load.setPath('assets/');
        this.load.tilemapTiledJSON('tilemap_key', 'maps/tilemap.json');

        // 今回のサンプルではタイルシートの一部をアイテムのスプライトとして使用するため、spritesheetメソッドを使用しています。
        // this.tilemap.addTilesetImageメソッドにテクスチャを渡すだけの場合は、this.load.imageメソッドで問題ありません。
        this.load.spritesheet('tilesheet_key', 'maps/tilesheet.png', { frameWidth: 64 });
        this.load.spritesheet('player', 'images/charasheet.png', { frameWidth: 80, frameHeight: 74 });
    }

    create() {
        // アニメーション定義
        this.anims.create({ key: 'walk', repeat: 0, frameRate: 6, frames: this.anims.generateFrameNumbers('player', { start: 2, end: 3 }) });

        // タイルマップを作る
        this.tilemap = this.make.tilemap({ key: 'tilemap_key' });
        // タイルマップ内で定義されているタイルシートの名前と、画像のキーを紐づける。
        // （なお、第2引数を省略した場合は、第1引数と同じ文字列が使われる。）
        this.tileset = this.tilemap.addTilesetImage('tilesheet', 'tilesheet_key') as Phaser.Tilemaps.Tileset;

        // Tilemapから各レイヤーを作成する。
        // createLayerの呼び出し順は表示に関係するので背景から作成する。
        const background = this.tilemap.createLayer('background', this.tileset, 0, 0); // 背景
        this.platform = this.tilemap.createLayer('platform', this.tileset, 0, 0) as Phaser.Tilemaps.TilemapLayer; // プラットフォーム
        this.objectsLayer = this.tilemap.getObjectLayer("objectsLayer") as Phaser.Tilemaps.ObjectLayer;           // オブジェクトレイヤー

        // プラットフォームレイヤーのプロパティから衝突検知対象のタイルを抽出する。
        this.platform.setCollisionByProperty({ collides: true });

        // プレイヤー
        const playerPos = this.objectsLayer.objects.find(o => o.name === "player") as Phaser.Types.Tilemaps.TiledObject;
        this.player = this.physics.add.sprite(playerPos.x, playerPos.y, 'player')
            .setOrigin(0.5, 1).setBounce(0.1).setBodySize(54, 66);
        // プレイヤーの移動範囲を画面の中だけとする。
        this.player.setCollideWorldBounds(true);

        // アイテムの配置
        this.keyGroup = this.deployItems('tilesheet_key', 'key');
        this.gemGroup = this.deployItems('tilesheet_key', 'gem', ['point']);

        // ゴール
        const goalPos = this.objectsLayer.objects.find(o => o.name === "goal") as Phaser.Types.Tilemaps.TiledObject;
        const goalRect = this.add.rectangle(goalPos.x, goalPos.y, goalPos.width, goalPos.height).setOrigin(0);
        const goalSprite = this.physics.add.existing(goalRect);
        const goalSpriteBody = goalSprite.body as Phaser.Physics.Arcade.Body;
        goalSpriteBody.setAllowGravity(false); // 重力の影響を無効化

        // 衝突検知：プレイヤーとプラットフォーム
        this.physics.add.collider(this.player, this.platform);
        // 重なり検知：プレイヤーと鍵
        this.physics.add.overlap(this.player, this.keyGroup, this.pickKey, undefined, this);
        // 重なり検知：プレイヤーと宝石
        this.physics.add.overlap(this.player, this.gemGroup, this.pickGem, undefined, this);
        // 重なり検知：プレイヤーとゴール
        this.physics.add.overlap(this.player, goalSprite, this.goalIn, undefined, this)

        // カメラ関連
        //this.cameras.main.setBackgroundColor(0xD0F4F7); // カメラで背景色を指定する場合
        this.cameras.main.setBounds(0, 0, this.tilemap.widthInPixels, this.tilemap.heightInPixels);
        // プレイヤーにカメラを追跡させる
        this.cameras.main.startFollow(this.player, true, 1, 1, 0, 300);

        // ワールド境界を設定する
        this.physics.world.setBounds(0, 0, this.tilemap.widthInPixels, this.tilemap.heightInPixels);

        // キー入力設定
        this.cursor = this.input.keyboard.createCursorKeys();
    }

    update(time: number, delta: number) {
        // プレイヤーの横移動速度を0に
        this.player.setVelocityX(0);
        // ジャンプから着地した時はテクスチャをリセット
        if (this.player.body.onFloor() && this.isJumping) {
            this.isJumping = false;
            this.player.anims.stop();
            this.player.setTexture('player', 0);
        }

        if (!this.cursor) {
            // ゴール後は移動不可
            return;
        }

        // ジャンプ（プレイヤーが地面に接地しているときのみジャンプ可能）
        if ((this.cursor.space.isDown || this.cursor.up.isDown) && this.player.body.onFloor()) {
            this.player.setVelocityY(-300);
            this.isJumping = true;
            this.player.anims.stop();
            this.player.setTexture('player', 1);
            return;
        }

        // 左右のキーに合わせて移動
        if (this.cursor.left.isDown || this.cursor.right.isDown) {
            const isLeft = this.cursor.left.isDown;
            this.player.setVelocityX(isLeft ? -200 : 200);
            this.player.setFlipX(isLeft);
            if (this.isJumping === false) {
                this.player.anims.play('walk', true);
            }
        }
    }

    // オブジェクトレイヤーから画面に表示するアイテムを作成し配置する
    private deployItems(spritesheet: string, item: string, propNames?: string[]): Phaser.Physics.Arcade.Group {
        // タイル1個あたりの横幅、高さを取得
        const tileSize = { w: this.tileset.tileWidth, h: this.tileset.tileHeight };
        // 指定の名前のオブジェクトのみを抽出する
        const items = this.objectsLayer.objects.filter(o => o.name === item);
        // 抽出したオブジェクトからスプライトを生成する
        const sprites = items.map(e => {
            const obj = e as Phaser.Types.Tilemaps.TiledObject;
            // アイテムの作成
            // オブジェクトレイヤーに配置したタイルは原点(Origin)が左下であるため、配置の際はx,yの値に注意。
            const sprite = this.physics.add.sprite(
                obj.x + tileSize.w / 2,
                obj.y - tileSize.h / 2,
                spritesheet, obj.gid - 1
            ).setOrigin(0.5);// tweenで動かす関係でspriteのOriginを0.5にする。
            sprite.setName(obj.name);
            sprite.setData('gid', obj.gid);

            // オブジェクトからカスタムプロパティを取得しスプライトのデータとして保持する。
            const customProps = obj.properties as CustomProp[];
            if (propNames && customProps?.length > 0) {
                propNames.forEach(name => {
                    const gotElm = customProps.find(f => f.name === name);
                    if (gotElm) {
                        sprite.setData(name, gotElm.value);
                    }
                })
            }
            return sprite;
        });

        // アイテムグループの作成
        const group = this.physics.add.group(sprites);
        group.children.iterate(i => {
            const item = i as Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
            item.body.setAllowGravity(false); // 重力の影響を無効化
            // この記事のサンプルコードではTiledの当たり判定設定は使わず、
            // 一律でアイテムを円形のボディにします（ブロックの4分の1サイズを円の半径にする）。
            item.setCircle(tileSize.w / 4).setOffset(tileSize.w / 4);
            return true;
        })
        return group;
    }

    /**
     * 鍵を拾った時の処理 
     */
    private pickKey(player: Phaser.Physics.Arcade.Sprite, key: Phaser.Physics.Arcade.Sprite) {
        key.disableBody(true, false);
        this.pickedkeyCount++;
        this.add.tween({
            targets: key, duration: 300, y: "-=40", scale: 2, alpha: 0, ease: 'power2',
            onComplete: () => key.disableBody(true, true) // ゴール時にカウントするのでdestroyしない
        } as Phaser.Types.Tweens.TweenBuilderConfig);
    }

    /**
     * 宝石を拾った時の処理 
     */
    private pickGem(player: Phaser.Physics.Arcade.Sprite, gem: Phaser.Physics.Arcade.Sprite) {
        gem.disableBody(true, false);
        const pointStyle: Phaser.Types.GameObjects.Text.TextStyle = { color: '#4090F5', fontSize: 32, stroke: '#FFFFFF', strokeThickness: 8 }
        const point = this.add.text(gem.x, gem.y, gem.getData('point'), pointStyle).setOrigin(0.5).setScale(0.5).setAlpha(0);
        this.add.tweenchain({
            tweens: [{
                targets: gem, duration: 300, y: "-=40", scale: 2, alpha: 0, ease: 'power2',
                onComplete: () => gem.disableBody(true, true)
            }, {
                targets: point, duration: 200, y: "-=50", scale: 1, alpha: 1, ease: 'power2',
            }, {
                targets: point, delay: 300, duration: 300, scale: 2, alpha: 0, ease: 'power2',
                onComplete: () => gem.destroy()
            }] as Phaser.Types.Tweens.TweenBuilderConfig[]
        });
    }

    /**
     * ゴールインした時の処理 
     */
    private goalIn() {
        // 鍵を全て拾ったかどうかのチェック
        if (this.pickedkeyCount !== this.keyGroup.getLength()) {
            return;
        }

        // プレイヤーとゴールの重なり検知の設定を削除
        this.physics.world.removeCollider(this.goalCollider);
        // キーボード入力の無効化
        this.input.keyboard.enabled = false;
        this.cursor = null;
        // アニメーション停止
        this.player.anims.stop();
        this.player.setTexture('player', 0);

        // ゴールの文字表示
        const { width: cW, height: cH } = this.game.canvas;
        this.add.text(cW / 2, cH / 2 - 200, 'GOAL !!', {
            fontSize: '64px', color: '#F5A623', backgroundColor: '#FFFFFF', shadow: { color: '#D3D3D3', fill: true, offsetX: 5, offsetY: 5, blur: 3 },
            padding: { left: 20, right: 20 }
        }).setOrigin(0.5).setScrollFactor(0);

        // リトライボタン表示
        const btn = this.add.text(cW / 2, cH / 2 + 200, 'RETRY', {
            fontSize: '48px', color: '#515151', backgroundColor: '#FFFFFF', padding: { left: 20, right: 20 }
        }).setOrigin(0.5).setScrollFactor(0);
        btn.once(Phaser.Input.Events.POINTER_DOWN, (e) => {
            this.input.keyboard.enabled = true;
            this.scene.restart();
        }).setInteractive();
    }
}
