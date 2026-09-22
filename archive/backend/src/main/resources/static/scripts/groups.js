/**
 * Study Groups Engine
 */

const mockGroups = [
    { id: 1, name: 'Luyện thi TOEIC 800+', members: 1250, materials: 45, status: 'Active', icon: '🎯' },
    { id: 2, name: 'JS & ReactJS VN', members: 3400, materials: 120, status: 'Active', icon: '💻' },
    { id: 3, name: 'Tự học Toán Cao Cấp', members: 890, materials: 32, status: 'Active', icon: '📐' },
    { id: 4, name: 'Cộng đồng Đọc sách', members: 5600, materials: 200, status: 'Active', icon: '📚' }
];

class GroupsEngine {
    renderGroupList() {
        const list = document.getElementById('groups-list');
        if(!list) return;
        
        list.innerHTML = mockGroups.map(g => `
            <div class="item-card card">
                <div style="font-size: 3rem; margin-bottom: 1rem">${g.icon}</div>
                <h3>${g.name}</h3>
                <p>👥 ${g.members} thành viên</p>
                <p>📁 ${g.materials} tài liệu chia sẻ</p>
                <div style="margin-top: 1rem; display: flex; gap: 0.5rem">
                    <button class="btn btn-primary" style="flex: 1">Vào nhóm</button>
                </div>
            </div>
        `).join('');
    }
}

window.groupsEngine = new GroupsEngine();
